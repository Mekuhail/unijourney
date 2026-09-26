import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { signSession, SESSION_COOKIE } from '../server/core/auth.ts';
import { createDocumentFromBuffer } from '../server/core/documents.ts';
import { makePdf } from '../server/seed/fixtures.ts';

interface Checklist { key: string; status: string; documentId: string | null; required: boolean }
interface Adm { id: string; status: string; personal: Record<string, unknown>; checklist: Checklist[]; receipt: { ref: string; simulated: boolean; label: string } | null; timeline: Array<{ status: string; note: string }>; completeness: { complete: boolean; missing: Array<{ key: string }> } }
interface Mine { items: Adm[]; active: Adm | null }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

async function upload(userId: string, pdf: Buffer, name: string) {
  const fd = new FormData();
  fd.set('kind', 'admission');
  fd.set('label', name);
  fd.set('file', new Blob([pdf], { type: 'application/pdf' }), name);
  const res = await fetch(`${s.url}/api/documents`, { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${signSession(userId)}` }, body: fd });
  return (await res.json()) as { ok: boolean; data: { id: string } };
}

describe('admission journey', () => {
  const omar = () => s.as('u_applicant');

  it('lists programmes with labelled criteria and campus availability', async () => {
    const r = await s.as('u_applicant').get<{ items: Array<{ id: string; campus_ids: string[]; criteria: Array<{ note: string }> }> }>('/admission/programs?campus=khobar');
    expect(r.status).toBe(200);
    const ids = r.body.data!.items.map((p) => p.id);
    expect(ids).toContain('bse'); expect(ids).toContain('law'); expect(ids).not.toContain('acc');
    expect(r.body.data!.items[0].criteria[0].note).toMatch(/Illustrative/);
    const one = await s.as('u_applicant').get<{ study_plan: { available: boolean }; source_url: string }>('/admission/programs/bse');
    expect(one.body.data!.source_url).toBe('https://yu.edu.sa/academics/coea/swe/');
  });

  it('blocks an incomplete submission with the missing list', async () => {
    const mine = await omar().get<Mine>('/admission/applications/mine');
    expect(mine.body.data!.active!.id).toBe('adm_omar_bse');
    expect(mine.body.data!.active!.status).toBe('draft');
    const r = await omar().post('/admission/applications/adm_omar_bse/submit');
    expect(r.status).toBe(422);
    const missing = (r.body.error!.details as { missing: Array<{ key: string; kind: string }> }).missing.map((m) => m.key);
    expect(missing).toContain('national_id_last4');
    expect(missing).toContain('date_of_birth');
    expect(missing).toContain('id_document');
    expect(missing).toContain('english_score');
    expect(missing).not.toContain('high_school_certificate');
    const second = await omar().post('/admission/applications', { programId: 'bcne', campusId: 'riyadh' });
    expect(second.status).toBe(409); // one active application at a time
  });

  it('validates personal fields server-side and never stores full national IDs', async () => {
    const bad = await omar().put('/admission/applications/adm_omar_bse', { phone: '12345', date_of_birth: '1990-13-40' });
    expect(bad.status).toBe(400);
    const paths = (bad.body.error!.details as Array<{ path: string }>).map((d) => d.path);
    expect(paths).toContain('phone');
    expect(paths).toContain('date_of_birth');
    const full = await omar().put('/admission/applications/adm_omar_bse', { national_id: '1234567890' });
    expect(full.status).toBe(400);
    const okr = await omar().put<Adm>('/admission/applications/adm_omar_bse', { national_id_last4: '4321', date_of_birth: '2008-03-14', phone: '0551234567', english_score: 78 });
    expect(okr.status).toBe(200);
    expect(okr.body.data!.personal.national_id_last4).toBe('4321');
    expect(okr.body.data!.personal.full_name).toBe('Omar Al-Qahtani'); // retained
    expect(JSON.stringify(okr.body.data!.personal)).not.toContain('1234567890');
  });

  it('attaches owned admission documents only, then submits and gets a demo receipt', async () => {
    const idDoc = await upload('u_applicant', makePdf(['SYNTHETIC DEMO ID DOCUMENT', 'Omar Al-Qahtani (fictional)']), 'id-demo.pdf');
    expect(idDoc.ok).toBe(true);
    const a1 = await omar().post<Adm>('/admission/applications/adm_omar_bse/documents', { checklistKey: 'id_document', documentId: idDoc.data.id });
    expect(a1.status).toBe(200);
    expect(a1.body.data!.checklist.find((c) => c.key === 'id_document')!.status).toBe('attached');
    // someone else's document cannot be attached
    const foreign = createDocumentFromBuffer('u_student', 'admission', 'not-mine.pdf', 'application/pdf', makePdf(['x']));
    expect((await omar().post('/admission/applications/adm_omar_bse/documents', { checklistKey: 'english_score', documentId: foreign.id })).status).toBe(403);
    // wrong kind
    const wrongKind = createDocumentFromBuffer('u_applicant', 'other', 'wrong.pdf', 'application/pdf', makePdf(['x']));
    expect((await omar().post('/admission/applications/adm_omar_bse/documents', { checklistKey: 'english_score', documentId: wrongKind.id })).status).toBe(400);
    const eng = createDocumentFromBuffer('u_applicant', 'admission', 'english-demo.pdf', 'application/pdf', makePdf(['SYNTHETIC ENGLISH SCORE REPORT', 'Score: 78']));
    const a2 = await omar().post<Adm>('/admission/applications/adm_omar_bse/documents', { checklistKey: 'english_score', documentId: eng.id });
    expect(a2.body.data!.completeness.complete).toBe(true);
    const sub = await omar().post<Adm & { receipt: { ref: string; simulated: boolean; label: string } }>('/admission/applications/adm_omar_bse/submit');
    expect(sub.status).toBe(200);
    expect(sub.body.data!.status).toBe('submitted');
    expect(sub.body.data!.receipt.ref).toMatch(/^ADM-[A-Z0-9]{4}-[A-Z0-9]{5}$/);
    expect(sub.body.data!.receipt.simulated).toBe(true);
    expect(sub.body.data!.receipt.label).toBe('Demo submission');
    expect(sub.body.data!.timeline.some((t) => t.status === 'submitted')).toBe(true);
    expect(db().count('notifications', "user_id = 'u_applicant' AND module = 'admission' AND kind = 'submitted'")).toBe(1);
    expect(db().count('email_outbox', "to_user_id = 'u_applicant' AND status = 'simulated'")).toBe(1);
    expect((await omar().put('/admission/applications/adm_omar_bse', { phone: '0559999999' })).status).toBe(409); // locked after submission
    expect((await omar().post('/admission/applications/adm_omar_bse/submit')).status).toBe(409);
  });

  it('requires the officer role for the review queue and keeps applications private', async () => {
    expect((await s.as('u_student').get('/admission/review/applications')).status).toBe(403);
    expect((await s.as('u_student').get('/admission/applications/adm_omar_bse')).status).toBe(403);
    expect((await s.as('u_student').post('/admission/review/applications/adm_omar_bse/decision', { decision: 'admitted', note: 'nope' })).status).toBe(403);
    const officer = s.as('u_admissions');
    const q = await officer.get<{ items: Adm[] }>('/admission/review/applications?status=submitted');
    expect(q.body.data!.items.map((a) => a.id)).toContain('adm_omar_bse');
    const detail = await officer.get<Adm & { documents: Record<string, { id: string }> }>('/admission/review/applications/adm_omar_bse');
    expect(detail.status).toBe(200);
    // officer document grant: submitted application documents are readable
    const docId = detail.body.data!.documents.high_school_certificate.id;
    expect((await officer.get('/documents/' + docId)).status).toBe(200);
    expect((await s.as('u_student').get('/documents/' + docId)).status).toBe(403);
  });

  it('officer decision → accept-offer transitions the same user record and retains personal data', async () => {
    const officer = s.as('u_admissions');
    const info = await officer.post<Adm>('/admission/review/applications/adm_omar_bse/decision', { decision: 'needs_information', note: 'Please confirm your English score document' });
    expect(info.body.data!.status).toBe('needs_information');
    expect((await omar().post('/admission/applications/adm_omar_bse/accept-offer')).status).toBe(409);
    const resub = await omar().post<Adm>('/admission/applications/adm_omar_bse/submit');
    expect(resub.body.data!.status).toBe('submitted');
    const adm = await officer.post<Adm>('/admission/review/applications/adm_omar_bse/decision', { decision: 'admitted', note: 'Admitted to BSE – demo decision recorded by an officer' });
    expect(adm.status).toBe(200);
    expect(adm.body.data!.status).toBe('admitted');
    expect(db().count('notifications', "user_id = 'u_applicant' AND kind = 'admitted'")).toBe(1);
    const before = db().get("SELECT roles, stage, student_no, program_id FROM users WHERE id = 'u_applicant'")!;
    expect(before.stage).toBe('applicant');
    expect(before.student_no).toBeNull();
    const acc = await omar().post<{ user: { id: string; roles: string; stage: string; student_no: string; program_id: string; campus_id: string }; application: Adm; student_no: string }>('/admission/applications/adm_omar_bse/accept-offer');
    expect(acc.status).toBe(200);
    expect(acc.body.data!.user.id).toBe('u_applicant');
    expect(acc.body.data!.user.stage).toBe('orientation');
    expect(JSON.parse(acc.body.data!.user.roles)).toContain('student');
    expect(acc.body.data!.user.student_no).toMatch(/^2026\d{5}$/);
    expect(acc.body.data!.user.program_id).toBe('bse');
    expect(acc.body.data!.application.status).toBe('enrolled');
    expect(db().count('users')).toBe(9); // no new user row was created
    const mine = await omar().get<Mine>('/admission/applications/mine');
    expect(mine.body.data!.active!.personal.national_id_last4).toBe('4321');
    expect(mine.body.data!.active!.personal.full_name).toBe('Omar Al-Qahtani');
    const ob = await omar().get<{ steps: Array<{ key: string; status: string }>; done: number; total: number }>('/admission/onboarding');
    expect(ob.body.data!.total).toBe(5);
    expect(ob.body.data!.done).toBe(0);
    for (const st of ob.body.data!.steps) { const r = await omar().post('/admission/onboarding/' + st.key + '/complete'); expect(r.status).toBe(200); }
    expect(db().get("SELECT stage FROM users WHERE id = 'u_applicant'")!.stage).toBe('current');
    // Sara's seeded onboarding is complete
    const sara = await s.as('u_student').get<{ complete: boolean }>('/admission/onboarding');
    expect(sara.body.data!.complete).toBe(true);
  });
});
