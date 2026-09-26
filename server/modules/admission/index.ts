import { Router } from 'express';
import { z } from 'zod';
import type { AppModule } from '../index.ts';
import type { User } from '../../../shared/types.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, bad, conflict, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { hasRole, requireRole, requireUser } from '../../core/auth.ts';
import { newId, publicRef } from '../../core/ids.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { notify, sendEmail } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { getDocument, registerDocumentGrant } from '../../core/documents.ts';
import { seedAdmission } from './seed.ts';
import { defaultChecklist, ONBOARDING_STEPS, type ChecklistItem } from './programs.ts';

export const admissionRouter = Router();

interface AppRow { id: string; applicant_id: string; program_id: string; campus_id: string; status: string; personal: string; checklist: string; receipt: string | null; timeline: string; reviewer_id: string | null; reviewer_note: string | null; submitted_at: string | null; decided_at: string | null; created_at: string; updated_at: string }
interface ProgramRow { id: string; code: string; name_en: string; name_ar: string; college_en: string; college_ar: string; degree: string; total_credits: number; duration_years: number; description_en: string; description_ar: string; criteria: string; campus_ids: string; source_url: string | null; source_note: string | null }
interface ReqRow { id: string; category: string; label_en: string; label_ar: string; required_credits: number; course_codes: string; sort: number }
interface Personal { full_name?: string; national_id_last4?: string; date_of_birth?: string; phone?: string; email?: string; high_school_gpa?: number; english_score?: number; nationality?: string; city?: string }

const EDITABLE = ['draft', 'needs_information'];
const ACTIVE = ['draft', 'submitted', 'under_review', 'needs_information', 'admitted', 'enrolled'];

function programRow(id: string) {
  const p = db().get<ProgramRow>('SELECT * FROM programs WHERE id = ?', id);
  return p ? { ...p, criteria: pj<unknown[]>(p.criteria, []), campus_ids: pj<string[]>(p.campus_ids, []) } : null;
}

function expand(r: AppRow) {
  const program = programRow(r.program_id);
  const applicant = db().get('SELECT id, name_en, name_ar, email, stage FROM users WHERE id = ?', r.applicant_id);
  const docs = db().all<{ checklist_key: string; document_id: string }>('SELECT checklist_key, document_id FROM application_documents WHERE application_id = ?', r.id);
  const documents = Object.fromEntries(docs.map((d) => [d.checklist_key, getDocument(d.document_id)]));
  return { ...r, personal: pj<Personal>(r.personal, {}), checklist: pj<ChecklistItem[]>(r.checklist, []), receipt: pj(r.receipt, null), timeline: pj<Array<{ at: string; status: string; note: string; actor?: string }>>(r.timeline, []), program: program ? { id: program.id, code: program.code, name_en: program.name_en, name_ar: program.name_ar, college_en: program.college_en, college_ar: program.college_ar, source_url: program.source_url } : null, applicant, documents, completeness: completeness(r) };
}

function getApp(id: string): AppRow {
  const r = db().get<AppRow>('SELECT * FROM admission_applications WHERE id = ?', id);
  if (!r) throw notFound('Application not found');
  return r;
}
function requireOwned(user: User, id: string): AppRow {
  const r = getApp(id);
  if (r.applicant_id !== user.id) throw forbidden('You can only access your own application');
  return r;
}
function pushTimeline(r: AppRow, status: string, note: string, actor?: string) {
  const tl = pj<Array<{ at: string; status: string; note: string; actor?: string }>>(r.timeline, []);
  tl.push({ at: nowIso(), status, note, actor });
  return j(tl);
}

const REQUIRED_PERSONAL: Array<{ key: keyof Personal; label: string }> = [
  { key: 'full_name', label: 'Full name' }, { key: 'national_id_last4', label: 'National ID (last 4 digits)' }, { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'phone', label: 'Mobile number' }, { key: 'email', label: 'Email' }, { key: 'high_school_gpa', label: 'High-school GPA' }
];

export function completeness(r: AppRow): { complete: boolean; missing: Array<{ key: string; label: string; kind: 'field' | 'document' }>; warnings: string[] } {
  const p = pj<Personal>(r.personal, {});
  const cl = pj<ChecklistItem[]>(r.checklist, []);
  const missing: Array<{ key: string; label: string; kind: 'field' | 'document' }> = [];
  for (const f of REQUIRED_PERSONAL) { const v = p[f.key]; if (v === undefined || v === null || v === '') missing.push({ key: f.key, label: f.label, kind: 'field' }); }
  for (const c of cl) if (c.required && c.status !== 'attached') missing.push({ key: c.key, label: c.label_en, kind: 'document' });
  const warnings: string[] = [];
  if (cl.some((c) => !c.required && c.status !== 'attached')) warnings.push('Personal photo not attached (optional).');
  if (p.english_score === undefined) warnings.push('No English score entered – placement may be required (illustrative).');
  if (typeof p.high_school_gpa === 'number' && p.high_school_gpa < 70) warnings.push('High-school GPA below the illustrative demo threshold of 70; an officer decides, not the system.');
  return { complete: missing.length === 0, missing, warnings };
}

// ---- programmes -----------------------------------------------------------
admissionRouter.get('/programs', h((req, res) => {
  const q = parse(z.object({ campus: z.string().optional(), college: z.string().optional() }), req.query);
  let rows = db().all<ProgramRow>('SELECT * FROM programs ORDER BY college_en, name_en').map((p) => ({ ...p, criteria: pj<unknown[]>(p.criteria, []), campus_ids: pj<string[]>(p.campus_ids, []), has_study_plan: db().count('degree_requirements', 'program_id = ?', p.id) > 0 }));
  if (q.campus) rows = rows.filter((p) => p.campus_ids.includes(q.campus!));
  if (q.college) rows = rows.filter((p) => p.college_en === q.college);
  ok(res, { items: rows, note: 'Programme list per yu.edu.sa; admission criteria are illustrative and labelled. Campus availability per yue.yu.edu.sa (demo interpretation).' });
}));

admissionRouter.get('/programs/:id', h((req, res) => {
  const p = programRow(req.params.id as string);
  if (!p) throw notFound('Programme not found');
  const reqs = db().all<ReqRow>('SELECT id, category, label_en, label_ar, required_credits, course_codes, sort FROM degree_requirements WHERE program_id = ? ORDER BY sort', p.id).map((r) => ({ ...r, course_codes: pj<string[]>(r.course_codes, []) }));
  const codes = [...new Set(reqs.flatMap((r) => r.course_codes))].slice(0, 12);
  const courses = codes.length ? db().all(`SELECT code, title_en, title_ar, credits, level FROM courses WHERE code IN (${codes.map(() => '?').join(',')}) ORDER BY level, code`, ...codes) : [];
  ok(res, { ...p, study_plan: { available: reqs.length > 0, buckets: reqs.map((r) => ({ id: r.id, category: r.category, label_en: r.label_en, label_ar: r.label_ar, required_credits: r.required_credits, courses: r.course_codes.length })), sample_courses: courses, source_url: p.source_url } });
}));

// ---- applicant -------------------------------------------------------------
admissionRouter.get('/applications/mine', h((req, res) => {
  const u = requireUser(req);
  const rows = db().all<AppRow>('SELECT * FROM admission_applications WHERE applicant_id = ? ORDER BY created_at DESC', u.id).map(expand);
  ok(res, { items: rows, active: rows.find((r) => ACTIVE.includes(r.status)) ?? null });
}));

admissionRouter.post('/applications', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ programId: z.string().min(1), campusId: z.enum(['riyadh', 'khobar']) }), req.body);
  const p = programRow(body.programId);
  if (!p) throw notFound('Programme not found');
  if (!p.campus_ids.includes(body.campusId)) throw bad(`${p.name_en} is not offered on the ${body.campusId} campus (demo catalogue)`);
  const active = db().get<AppRow>(`SELECT * FROM admission_applications WHERE applicant_id = ? AND status IN ('draft','submitted','under_review','needs_information','admitted')`, u.id);
  if (active) throw conflict('You already have an active application. Continue it or withdraw it first.', { applicationId: active.id, status: active.status });
  const now = nowIso();
  const id = newId('adm');
  db().insert('admission_applications', { id, applicant_id: u.id, program_id: p.id, campus_id: body.campusId, status: 'draft', personal: j({ full_name: u.name_en, email: u.email }), checklist: j(defaultChecklist()), receipt: null, timeline: j([{ at: now, status: 'draft', note: 'Application draft created' }]), reviewer_id: null, reviewer_note: null, submitted_at: null, decided_at: null, created_at: now, updated_at: now });
  audit(u.id, 'admission.application.create', 'admission_application', id, { program_id: p.id, campus_id: body.campusId });
  ok(res, expand(getApp(id)), 201);
}));

admissionRouter.get('/applications/:id', h((req, res) => {
  const u = requireUser(req);
  ok(res, expand(requireOwned(u, req.params.id as string)));
}));

const personalSchema = z.object({
  full_name: z.string().trim().min(3, 'Enter your full name').max(120).optional(),
  national_id_last4: z.string().regex(/^\d{4}$/, 'Enter only the last 4 digits of your national ID').optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => { const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; }, 'Enter a real calendar date').refine((d) => { const y = Number(d.slice(0, 4)); const ty = Number(todayIso().slice(0, 4)); return ty - y >= 15 && ty - y <= 60; }, 'Applicants must be between 15 and 60 years old (demo rule)').optional(),
  phone: z.string().regex(/^(\+966|0)5\d{8}$/, 'Enter a Saudi mobile number, e.g. 05xxxxxxxx').optional(),
  email: z.string().email('Enter a valid email').optional(),
  high_school_gpa: z.number().min(0).max(100, 'GPA is a percentage (0–100)').optional(),
  english_score: z.number().min(0).max(120).optional().nullable(),
  nationality: z.string().max(60).optional(),
  city: z.string().max(60).optional()
});

admissionRouter.put('/applications/:id', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwned(u, req.params.id as string);
  if (!EDITABLE.includes(r.status)) throw conflict(`Application is ${r.status} and can no longer be edited`);
  const raw = req.body as Record<string, unknown>;
  if (typeof raw.national_id === 'string') throw bad('Full national IDs are never stored. Send national_id_last4 only.', [{ path: 'national_id', message: 'Only the last 4 digits are accepted' }]);
  const body = parse(personalSchema, raw);
  const next = { ...pj<Personal>(r.personal, {}), ...body };
  db().update('admission_applications', r.id, { personal: j(next), updated_at: nowIso() });
  audit(u.id, 'admission.application.update', 'admission_application', r.id, { fields: Object.keys(body) });
  ok(res, expand(getApp(r.id)));
}));

admissionRouter.post('/applications/:id/documents', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwned(u, req.params.id as string);
  if (!EDITABLE.includes(r.status)) throw conflict(`Application is ${r.status} and can no longer be edited`);
  const body = parse(z.object({ checklistKey: z.string().min(1), documentId: z.string().min(1) }), req.body);
  const cl = pj<ChecklistItem[]>(r.checklist, []);
  const item = cl.find((c) => c.key === body.checklistKey);
  if (!item) throw bad('Unknown checklist item');
  const doc = getDocument(body.documentId);
  if (!doc || doc.owner_id !== u.id) throw forbidden('Document not found or not yours');
  if (doc.kind !== 'admission') throw bad('Upload the file with kind "admission"');
  item.documentId = doc.id;
  item.status = 'attached';
  db().tx(() => {
    db().upsert('application_documents', { application_id: r.id, checklist_key: item.key, document_id: doc.id });
    db().update('admission_applications', r.id, { checklist: j(cl), timeline: pushTimeline(r, r.status, `Attached ${item.label_en}`), updated_at: nowIso() });
  });
  audit(u.id, 'admission.document.attach', 'admission_application', r.id, { key: item.key, document_id: doc.id });
  ok(res, expand(getApp(r.id)));
}));

admissionRouter.delete('/applications/:id/documents/:key', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwned(u, req.params.id as string);
  if (!EDITABLE.includes(r.status)) throw conflict(`Application is ${r.status} and can no longer be edited`);
  const cl = pj<ChecklistItem[]>(r.checklist, []);
  const item = cl.find((c) => c.key === req.params.key);
  if (!item) throw bad('Unknown checklist item');
  item.documentId = null;
  item.status = 'missing';
  db().tx(() => {
    db().run('DELETE FROM application_documents WHERE application_id = ? AND checklist_key = ?', r.id, item.key);
    db().update('admission_applications', r.id, { checklist: j(cl), updated_at: nowIso() });
  });
  ok(res, expand(getApp(r.id)));
}));

admissionRouter.get('/applications/:id/completeness', h((req, res) => {
  const u = requireUser(req);
  ok(res, completeness(requireOwned(u, req.params.id as string)));
}));

admissionRouter.post('/applications/:id/submit', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwned(u, req.params.id as string);
  if (!EDITABLE.includes(r.status)) throw conflict(`Application is already ${r.status}`);
  const c = completeness(r);
  if (!c.complete) throw unprocessable('Your application is not complete yet', { missing: c.missing, warnings: c.warnings });
  const now = nowIso();
  const receipt = { ref: publicRef('ADM'), submitted_at: now, simulated: true, label: 'Demo submission', program_id: r.program_id, campus_id: r.campus_id };
  const program = programRow(r.program_id);
  db().tx(() => {
    db().update('admission_applications', r.id, { status: 'submitted', submitted_at: now, receipt: j(receipt), timeline: pushTimeline(r, 'submitted', `Submitted (demo receipt ${receipt.ref})`, u.id), updated_at: now });
    notify(u.id, { module: 'admission', kind: 'submitted', title: 'Application submitted (demo)', body: `Reference ${receipt.ref}. The admissions office will review it – this is a simulated submission.`, link: '/journey/admission' });
    sendEmail({ toUserId: u.id, toAddress: u.email, subject: `[Demo] Application receipt ${receipt.ref}`, module: 'admission', text: `This is a simulated receipt. Application ${receipt.ref} for ${program?.name_en ?? r.program_id} (${r.campus_id}) was received on ${now}. Nothing was sent to a real admissions system.`, html: `<p><strong>Simulated receipt.</strong> Application <code>${receipt.ref}</code> for ${program?.name_en ?? r.program_id} (${r.campus_id}) was received on ${now}.</p><p>Nothing was sent to a real admissions system.</p>` });
    for (const officer of db().all<{ id: string }>(`SELECT id FROM users WHERE roles LIKE '%admission_officer%'`)) notify(officer.id, { module: 'admission', kind: 'queue', title: 'New admission application', body: `${u.name_en} – ${program?.name_en ?? r.program_id}`, link: `/staff/journey/admissions` });
  });
  audit(u.id, 'admission.application.submit', 'admission_application', r.id, { ref: receipt.ref, simulated: true });
  ok(res, { ...expand(getApp(r.id)), receipt });
}));

/** Applicant accepts an admission offer → the SAME user record becomes a student (no re-entry of personal data). */
admissionRouter.post('/applications/:id/accept-offer', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwned(u, req.params.id as string);
  if (r.status !== 'admitted') throw conflict(`Only admitted applications can be accepted (current status: ${r.status})`);
  const p = programRow(r.program_id);
  const now = nowIso();
  const studentNo = `${todayIso().slice(0, 4)}${String(50000 + db().count('users', 'student_no IS NOT NULL')).padStart(5, '0')}`;
  db().tx(() => {
    const roles = [...new Set([...u.roles, 'student'])];
    db().update('users', u.id, { roles: j(roles), stage: 'orientation', program_id: r.program_id, campus_id: r.campus_id, student_no: studentNo, level: 1 });
    db().upsert('onboarding', { user_id: u.id, steps: j(ONBOARDING_STEPS.map((s) => ({ ...s, status: 'pending', completed_at: null }))), updated_at: now });
    db().update('admission_applications', r.id, { status: 'enrolled', timeline: pushTimeline(r, 'enrolled', `Offer accepted – student number ${studentNo} issued (demo)`, u.id), updated_at: now });
    notify(u.id, { module: 'admission', kind: 'enrolled', title: `Welcome to ${p?.name_en ?? 'Al Yamamah University'}!`, body: `Your student number is ${studentNo} (demo). Start your onboarding checklist.`, link: '/journey/onboarding' });
  });
  audit(u.id, 'admission.offer.accept', 'user', u.id, { application_id: r.id, student_no: studentNo, program_id: r.program_id });
  ok(res, { application: expand(getApp(r.id)), user: db().get('SELECT id, roles, stage, program_id, campus_id, student_no, level FROM users WHERE id = ?', u.id), student_no: studentNo });
}));

// ---- onboarding ------------------------------------------------------------
type Step = { key: string; label_en: string; label_ar: string; link: string; status: 'pending' | 'done'; completed_at: string | null };
function onboardingFor(userId: string) {
  const row = db().get('SELECT * FROM onboarding WHERE user_id = ?', userId);
  const steps = row ? pj<Step[]>(row.steps, []) : [];
  const done = steps.filter((s) => s.status === 'done').length;
  return { exists: !!row, steps, done, total: steps.length, complete: steps.length > 0 && done === steps.length, updated_at: row?.updated_at ?? null, adviser: { name_en: 'Dr. Hala Al-Mutairi (demo adviser)', name_ar: 'د. هالة المطيري (مرشدة تجريبية)', email: 'hala.demo@staff.yu-demo.invalid', office: 'Tuwaiq Building, E203 (demo)' } };
}
admissionRouter.get('/onboarding', h((req, res) => {
  const u = requireUser(req);
  ok(res, { ...onboardingFor(u.id), stage: u.stage });
}));
admissionRouter.post('/onboarding/:key/complete', h((req, res) => {
  const u = requireUser(req);
  const ob = onboardingFor(u.id);
  if (!ob.exists) throw notFound('No onboarding checklist for this user');
  const step = ob.steps.find((s) => s.key === req.params.key);
  if (!step) throw notFound('Unknown step');
  if (step.status !== 'done') { step.status = 'done'; step.completed_at = nowIso(); }
  const allDone = ob.steps.every((s) => s.status === 'done');
  db().tx(() => {
    db().update('onboarding', u.id, { steps: j(ob.steps), updated_at: nowIso() }, 'user_id');
    if (allDone && u.stage === 'orientation') {
      db().update('users', u.id, { stage: 'current' });
      notify(u.id, { module: 'admission', kind: 'onboarded', title: 'Onboarding complete – you are a current student', body: 'Your journey stage moved to Current student.', link: '/journey' });
    }
  });
  audit(u.id, 'onboarding.step.complete', 'onboarding', u.id, { key: step.key, allDone });
  ok(res, { ...onboardingFor(u.id), stage: allDone && u.stage === 'orientation' ? 'current' : u.stage });
}));

// ---- officer ---------------------------------------------------------------
admissionRouter.get('/review/applications', h((req, res) => {
  requireRole(req, 'admission_officer');
  const q = parse(z.object({ status: z.string().optional() }), req.query);
  const rows = q.status
    ? db().all<AppRow>('SELECT * FROM admission_applications WHERE status = ? ORDER BY submitted_at DESC, created_at DESC', q.status)
    : db().all<AppRow>(`SELECT * FROM admission_applications WHERE status != 'draft' ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 WHEN 'needs_information' THEN 2 ELSE 3 END, submitted_at DESC`);
  ok(res, { items: rows.map(expand) });
}));
admissionRouter.get('/review/applications/:id', h((req, res) => {
  requireRole(req, 'admission_officer');
  const r = getApp(req.params.id as string);
  if (r.status === 'draft') throw forbidden('Drafts are private to the applicant until submitted');
  ok(res, expand(r));
}));
admissionRouter.post('/review/applications/:id/start-review', h((req, res) => {
  const officer = requireRole(req, 'admission_officer');
  const r = getApp(req.params.id as string);
  if (r.status !== 'submitted') throw conflict(`Application is ${r.status}`);
  db().update('admission_applications', r.id, { status: 'under_review', reviewer_id: officer.id, timeline: pushTimeline(r, 'under_review', 'Review started', officer.id), updated_at: nowIso() });
  ok(res, expand(getApp(r.id)));
}));
admissionRouter.post('/review/applications/:id/decision', h((req, res) => {
  const officer = requireRole(req, 'admission_officer');
  const r = getApp(req.params.id as string);
  const body = parse(z.object({ decision: z.enum(['admitted', 'rejected', 'needs_information']), note: z.string().trim().min(3, 'Add a short note for the applicant').max(1000) }), req.body);
  if (!['submitted', 'under_review', 'needs_information'].includes(r.status)) throw conflict(`Cannot decide an application that is ${r.status}`);
  const now = nowIso();
  const p = programRow(r.program_id);
  db().tx(() => {
    db().update('admission_applications', r.id, { status: body.decision, reviewer_id: officer.id, reviewer_note: body.note, decided_at: body.decision === 'needs_information' ? null : now, timeline: pushTimeline(r, body.decision, body.note, officer.id), updated_at: now });
    const titles = { admitted: `Admission offer – ${p?.name_en ?? r.program_id} (demo decision)`, rejected: 'Admission decision recorded (demo)', needs_information: 'Admissions needs more information' };
    notify(r.applicant_id, { module: 'admission', kind: body.decision, title: titles[body.decision], body: body.note, link: '/journey/admission' });
  });
  audit(officer.id, 'admission.decision', 'admission_application', r.id, { decision: body.decision });
  ok(res, expand(getApp(r.id)));
}));

// Officers may open documents attached to submitted (non-draft) applications.
registerDocumentGrant((doc, user) => {
  if (doc.kind !== 'admission' || !hasRole(user, 'admission_officer')) return false;
  return !!db().get(`SELECT 1 FROM application_documents ad JOIN admission_applications a ON a.id = ad.application_id WHERE ad.document_id = ? AND a.status != 'draft'`, doc.id);
});

export const admissionModule: AppModule = { name: 'admission', router: admissionRouter, seed: seedAdmission };
