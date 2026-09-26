import type { SeedContext } from '../../seed/context.ts';
import { j } from '../../core/db.ts';
import { addDays, localToIso, nowIso } from '../../core/clock.ts';
import { createDocumentFromBuffer } from '../../core/documents.ts';
import { makePdf } from '../../seed/fixtures.ts';
import { PROGRAMS, defaultChecklist, ONBOARDING_STEPS } from './programs.ts';

export function seedAdmission(ctx: SeedContext) {
  const { db: d, today } = ctx;
  for (const p of PROGRAMS) {
    d.insert('programs', { id: p.id, code: p.code, name_en: p.name_en, name_ar: p.name_ar, college_en: p.college_en, college_ar: p.college_ar, degree: p.degree, total_credits: p.total_credits, duration_years: p.duration_years, description_en: p.description_en, description_ar: p.description_ar, criteria: j(p.criteria), campus_ids: j(p.campus_ids), source_url: p.source_url, source_note: p.source_note });
  }

  // Omar's draft (synthetic person; partial data so the demo shows the completeness gate)
  const created = localToIso(addDays(today, -5), '19:30');
  const checklist = defaultChecklist();
  const doc = createDocumentFromBuffer(ctx.users.applicant, 'admission', 'high-school-certificate-demo.pdf', 'application/pdf', makePdf(['SYNTHETIC DEMO DOCUMENT - not a real certificate', 'High School Certificate', 'Student: Omar Al-Qahtani (fictional)', 'Track: Natural Sciences', 'GPA: 92.4 / 100', 'Issued: 2026-06-15', 'Reference: HS-DEMO-2026-0412'], 'High-school certificate (demo)'), 'High-school certificate (demo)', { synthetic: true });
  const hs = checklist.find((c) => c.key === 'high_school_certificate')!;
  hs.documentId = doc.id;
  hs.status = 'attached';
  const appId = 'adm_omar_bse';
  d.insert('admission_applications', {
    id: appId, applicant_id: ctx.users.applicant, program_id: 'bse', campus_id: 'riyadh', status: 'draft',
    personal: j({ full_name: 'Omar Al-Qahtani', email: 'omar.demo@applicant.yu-demo.invalid', phone: '0551234567', high_school_gpa: 92.4 }),
    checklist: j(checklist), receipt: null,
    timeline: j([{ at: created, status: 'draft', note: 'Application draft created' }, { at: localToIso(addDays(today, -3), '20:10'), status: 'draft', note: 'Attached high-school certificate' }]),
    reviewer_id: null, reviewer_note: null, submitted_at: null, decided_at: null, created_at: created, updated_at: localToIso(addDays(today, -3), '20:10')
  });
  d.insert('application_documents', { application_id: appId, checklist_key: 'high_school_certificate', document_id: doc.id });

  // Sara's onboarding: all steps done (what a completed checklist looks like)
  const doneAt = (n: number) => localToIso(addDays(today, -400 + n), '10:00');
  d.insert('onboarding', { user_id: ctx.users.student, steps: j(ONBOARDING_STEPS.map((s, i) => ({ ...s, status: 'done', completed_at: doneAt(i) }))), updated_at: nowIso() });
}
