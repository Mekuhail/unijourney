import { Router } from 'express';
import { z } from 'zod';
import type { AppModule } from '../index.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, conflict, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { requireRole, requireUser } from '../../core/auth.ts';
import { newId, publicRef } from '../../core/ids.ts';
import { nowIso } from '../../core/clock.ts';
import { config } from '../../core/config.ts';
import { CURRENT_TERM, TERM_LABELS } from '../../core/settings.ts';
import { notify, sendEmail } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { computeDegreeAudit, type DegreeAudit } from '../academics/audit.ts';
import { seedGraduation, CLEARANCE_KEYS } from './seed.ts';

export const graduationRouter = Router();

interface Clearance { id: string; student_id: string; key: string; label_en: string; label_ar: string; status: string; cleared_by: string | null; cleared_at: string | null; note: string | null }
interface RequestRow { id: string; student_id: string; status: string; audit_snapshot: string; reviewer_id: string | null; reviewer_note: string | null; receipt: string | null; submitted_at: string | null; decided_at: string | null; created_at: string }

const COOP_CODE = 'CIS 490';

function clearancesFor(studentId: string): Clearance[] {
  const rows = db().all<Clearance>('SELECT * FROM clearance_items WHERE student_id = ? ORDER BY rowid', studentId);
  if (rows.length) return rows;
  // Students without seeded rows get the standard checklist (all pending) so the page is never empty.
  return CLEARANCE_KEYS.map((k) => ({ id: `virtual:${k.key}`, student_id: studentId, key: k.key, label_en: k.label_en, label_ar: k.label_ar, status: 'pending', cleared_by: null, cleared_at: null, note: null }));
}

function coopMilestone(studentId: string) {
  const e = db().get<{ status: string; term: string; grade: string | null; evidence: string | null }>(`SELECT status, term, grade, evidence FROM transcript_entries WHERE student_id = ? AND course_code = ? ORDER BY CASE status WHEN 'completed' THEN 0 WHEN 'equivalent' THEN 0 WHEN 'enrolled' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END LIMIT 1`, studentId, COOP_CODE);
  const course = db().get<{ title_en: string; credits: number }>('SELECT title_en, credits FROM courses WHERE code = ?', COOP_CODE);
  return { code: COOP_CODE, title_en: course?.title_en ?? 'Cooperative Assignment', credits: course?.credits ?? 6, status: e?.status ?? 'missing', term: e?.term ?? null, term_label: e?.term ? TERM_LABELS[e.term]?.en ?? e.term : null, grade: e?.grade ?? null, evidence: e?.evidence ?? null, counts: !!e && (e.status === 'completed' || e.status === 'equivalent') };
}

function latestRequest(studentId: string) {
  const r = db().get<RequestRow>('SELECT * FROM graduation_requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', studentId);
  return r ? expandRequest(r) : null;
}
function expandRequest(r: RequestRow) {
  const student = db().get('SELECT id, name_en, name_ar, student_no, program_id, stage FROM users WHERE id = ?', r.student_id);
  return { ...r, audit_snapshot: pj<DegreeAudit | null>(r.audit_snapshot, null), receipt: pj(r.receipt, null), student, clearances: clearancesFor(r.student_id) };
}

function buildAudit(studentId: string) {
  const audit = computeDegreeAudit(studentId);
  const clearances = clearancesFor(studentId);
  const coop = coopMilestone(studentId);
  const open = db().get<RequestRow>(`SELECT * FROM graduation_requests WHERE student_id = ? AND status IN ('submitted','under_review','approved') ORDER BY created_at DESC LIMIT 1`, studentId);
  const blockers: Array<{ key: string; message: string }> = [];
  if (audit.remaining > 0) blockers.push({ key: 'credits', message: `${audit.remaining} credit${audit.remaining === 1 ? '' : 's'} still unmet (${audit.unmet.map((u) => u.bucket).join(', ') || 'see buckets'})` });
  for (const c of clearances) if (c.status !== 'cleared') blockers.push({ key: `clearance:${c.key}`, message: `${c.label_en} – ${c.status}` });
  if (open) blockers.push({ key: 'request', message: `A graduation request is already ${open.status}` });
  return { audit, clearances, coop, blockers, canRequest: blockers.length === 0, request: latestRequest(studentId), policy_note: 'Planned and enrolled credits are never counted as earned. Requirements come from the seeded study plan; the estimate states its assumptions.' };
}

graduationRouter.get('/audit', h((req, res) => {
  const u = requireUser(req);
  ok(res, { ...buildAudit(u.id), stage: u.stage, demoMode: config.demoMode });
}));

/** Demo fixture action: fulfil the first unmet requirement with an approved equivalent (labelled; demo mode only). */
graduationRouter.post('/demo/fulfil-requirement', h((req, res) => {
  const u = requireUser(req);
  if (!config.demoMode) throw forbidden('Demo fixtures are only available in demo mode');
  const body = parse(z.object({ course_code: z.string().optional() }), req.body ?? {});
  const audit0 = computeDegreeAudit(u.id);
  if (audit0.remaining === 0) throw conflict('All requirements are already met');
  // Only courses that can still close a gap: buckets with remaining credits, "missing" first, then enrolled/planned/failed.
  const order = (s: string) => ({ missing: 0, failed: 1, withdrawn: 1, enrolled: 2, planned: 3 } as Record<string, number>)[s] ?? 9;
  const missingCodes = audit0.buckets.filter((b) => b.remaining_credits > 0)
    .flatMap((b) => b.courses.filter((c) => c.status !== 'completed' && c.status !== 'equivalent').map((c) => ({ code: c.code, credits: c.credits, bucket: b.label_en, status: c.status })))
    .sort((a, b) => order(a.status) - order(b.status));
  const pick = body.course_code ? missingCodes.find((c) => c.code === body.course_code) : missingCodes.find((c) => c.code === COOP_CODE) ?? missingCodes[0];
  if (!pick) throw unprocessable('No specific missing course found to fulfil; the remaining credits are in an open elective pool.', { unmet: audit0.unmet });
  const evidence = pick.code === COOP_CODE ? 'Co-op completion letter (demo fixture)' : `Approved equivalent – demo fixture (${pick.bucket})`;
  const existing = db().get<{ id: string; status: string }>('SELECT id, status FROM transcript_entries WHERE student_id = ? AND course_code = ? AND term = ?', u.id, pick.code, CURRENT_TERM);
  db().tx(() => {
    if (existing) db().update('transcript_entries', existing.id, { status: 'equivalent', grade: null, evidence, credits: pick.credits });
    else db().insert('transcript_entries', { id: newId('tr'), student_id: u.id, course_code: pick.code, term: CURRENT_TERM, status: 'equivalent', grade: null, credits: pick.credits, section_id: null, evidence, created_at: nowIso() });
  });
  audit(u.id, 'graduation.demo.fulfil', 'transcript_entry', pick.code, { simulated: true, evidence });
  ok(res, { simulated: true, label: 'Demo fixture: requirement fulfilled with an approved equivalent', course: pick.code, evidence, ...buildAudit(u.id) });
}));

/** Demo fixture action: post results for the current term (enrolled -> completed). Labelled; demo mode only. */
graduationRouter.post('/demo/post-term-results', h((req, res) => {
  const u = requireUser(req);
  if (!config.demoMode) throw forbidden('Demo fixtures are only available in demo mode');
  const rows = db().all<{ id: string; course_code: string }>("SELECT id, course_code FROM transcript_entries WHERE student_id = ? AND status = 'enrolled'", u.id);
  if (!rows.length) throw conflict('No enrolled courses to post results for');
  db().tx(() => {
    for (const r of rows) db().update('transcript_entries', r.id, { status: 'completed', grade: 'A-', evidence: 'Demo fixture: term results posted' });
  });
  audit(u.id, 'graduation.demo.post_results', 'transcript_entries', u.id, { simulated: true, courses: rows.map((r) => r.course_code) });
  ok(res, { simulated: true, label: 'Demo fixture: current-term results posted', courses: rows.map((r) => r.course_code), ...buildAudit(u.id) });
}));

graduationRouter.post('/demo/clear-clearances', h((req, res) => {
  const u = requireUser(req);
  if (!config.demoMode) throw forbidden('Demo fixtures are only available in demo mode');
  const rows = clearancesFor(u.id);
  db().tx(() => {
    for (const c of rows) {
      if (c.id.startsWith('virtual:')) db().insert('clearance_items', { id: newId('clr'), student_id: u.id, key: c.key, label_en: c.label_en, label_ar: c.label_ar, status: 'cleared', cleared_by: 'demo-fixture', cleared_at: nowIso(), note: 'Cleared by demo fixture action' });
      else if (c.status !== 'cleared') db().update('clearance_items', c.id, { status: 'cleared', cleared_by: 'demo-fixture', cleared_at: nowIso(), note: `${c.note ?? ''} Cleared by demo fixture action.`.trim() });
    }
  });
  audit(u.id, 'graduation.demo.clearances', 'clearance_items', u.id, { simulated: true });
  ok(res, { simulated: true, label: 'Demo fixture: all clearances marked cleared', ...buildAudit(u.id) });
}));

graduationRouter.post('/requests', h((req, res) => {
  const u = requireUser(req);
  const a = buildAudit(u.id);
  if (!a.canRequest) throw unprocessable('Graduation request blocked', { reasons: a.blockers.map((b) => b.message), blockers: a.blockers, remaining: a.audit.remaining });
  const now = nowIso();
  const id = newId('grd');
  const receipt = { ref: publicRef('GRD'), submitted_at: now, simulated: true, label: 'Demo submission' };
  db().tx(() => {
    db().insert('graduation_requests', { id, student_id: u.id, status: 'submitted', audit_snapshot: j(a.audit), reviewer_id: null, reviewer_note: null, receipt: j(receipt), submitted_at: now, decided_at: null, created_at: now });
    notify(u.id, { module: 'graduation', kind: 'submitted', title: 'Graduation request submitted', body: `Reference ${receipt.ref}. The registrar will review your audit snapshot.`, link: '/journey/graduation' });
    sendEmail({ toUserId: u.id, toAddress: u.email, subject: `[Demo] Graduation request ${receipt.ref}`, module: 'graduation', text: `Simulated receipt ${receipt.ref}: graduation request received on ${now} with ${a.audit.earned}/${a.audit.total_required} credits earned.`, html: `<p><strong>Simulated receipt</strong> <code>${receipt.ref}</code>: graduation request received on ${now} with ${a.audit.earned}/${a.audit.total_required} credits earned.</p>` });
    for (const r of db().all<{ id: string }>(`SELECT id FROM users WHERE roles LIKE '%registrar%'`)) notify(r.id, { module: 'graduation', kind: 'queue', title: 'New graduation request', body: `${u.name_en} (${u.student_no ?? 'no student no.'})`, link: '/staff/journey/graduation' });
  });
  audit(u.id, 'graduation.request.submit', 'graduation_request', id, { ref: receipt.ref, simulated: true });
  ok(res, { request: latestRequest(u.id), receipt }, 201);
}));

graduationRouter.get('/requests/mine', h((req, res) => {
  const u = requireUser(req);
  ok(res, { items: db().all<RequestRow>('SELECT * FROM graduation_requests WHERE student_id = ? ORDER BY created_at DESC', u.id).map(expandRequest) });
}));

// ---- registrar --------------------------------------------------------------
graduationRouter.get('/review/requests', h((req, res) => {
  requireRole(req, 'registrar');
  const q = parse(z.object({ status: z.string().optional() }), req.query);
  const rows = q.status ? db().all<RequestRow>('SELECT * FROM graduation_requests WHERE status = ? ORDER BY submitted_at DESC', q.status) : db().all<RequestRow>(`SELECT * FROM graduation_requests ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END, submitted_at DESC`);
  ok(res, { items: rows.map(expandRequest) });
}));
graduationRouter.get('/review/requests/:id', h((req, res) => {
  requireRole(req, 'registrar');
  const r = db().get<RequestRow>('SELECT * FROM graduation_requests WHERE id = ?', req.params.id as string);
  if (!r) throw notFound('Request not found');
  ok(res, { ...expandRequest(r), live_audit: computeDegreeAudit(r.student_id) });
}));
graduationRouter.post('/review/requests/:id/decision', h((req, res) => {
  const registrar = requireRole(req, 'registrar');
  const r = db().get<RequestRow>('SELECT * FROM graduation_requests WHERE id = ?', req.params.id as string);
  if (!r) throw notFound('Request not found');
  if (!['submitted', 'under_review'].includes(r.status)) throw conflict(`Request is already ${r.status}`);
  const body = parse(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(3).max(1000) }), req.body);
  const now = nowIso();
  db().tx(() => {
    db().update('graduation_requests', r.id, { status: body.decision, reviewer_id: registrar.id, reviewer_note: body.note, decided_at: now });
    if (body.decision === 'approved') notify(r.student_id, { module: 'graduation', kind: 'approved', title: 'Graduation approved — career handoff ready', body: `${body.note} Your applications, suggested roles and readiness checklist are waiting in Career.`, link: '/career?handoff=1' });
    else notify(r.student_id, { module: 'graduation', kind: 'rejected', title: 'Graduation request returned', body: body.note, link: '/journey/graduation' });
  });
  audit(registrar.id, 'graduation.decision', 'graduation_request', r.id, { decision: body.decision });
  ok(res, expandRequest(db().get<RequestRow>('SELECT * FROM graduation_requests WHERE id = ?', r.id)!));
}));

graduationRouter.get('/review/students/:studentId/clearances', h((req, res) => {
  requireRole(req, 'registrar');
  ok(res, { items: clearancesFor(req.params.studentId as string) });
}));
graduationRouter.post('/clearances/:key/clear', h((req, res) => {
  const registrar = requireRole(req, 'registrar');
  const body = parse(z.object({ studentId: z.string().min(1), note: z.string().max(300).optional() }), req.body);
  const key = req.params.key as string;
  const spec = CLEARANCE_KEYS.find((k) => k.key === key);
  if (!spec) throw notFound('Unknown clearance');
  if (!db().get('SELECT id FROM users WHERE id = ?', body.studentId)) throw notFound('Student not found');
  const existing = db().get<Clearance>('SELECT * FROM clearance_items WHERE student_id = ? AND key = ?', body.studentId, key);
  if (existing) db().update('clearance_items', existing.id, { status: 'cleared', cleared_by: registrar.id, cleared_at: nowIso(), note: body.note ?? existing.note });
  else db().insert('clearance_items', { id: newId('clr'), student_id: body.studentId, key, label_en: spec.label_en, label_ar: spec.label_ar, status: 'cleared', cleared_by: registrar.id, cleared_at: nowIso(), note: body.note ?? null });
  audit(registrar.id, 'graduation.clearance.clear', 'clearance_item', `${body.studentId}:${key}`, {});
  ok(res, { items: clearancesFor(body.studentId) });
}));

export const graduationModule: AppModule = { name: 'graduation', router: graduationRouter, seed: seedGraduation };
