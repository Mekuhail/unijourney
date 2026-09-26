import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { createDocumentFromBuffer } from '../server/core/documents.ts';
import { makePdf } from '../server/seed/fixtures.ts';

interface Excuse { id: string; status: string; revision: number; attendance_ids: string[]; document_ids: string[]; approval_id: string | null; checks: Array<{ id: string; status: string }>; from_date: string | null; to_date: string | null; reference: string | null; portal_request_id: string | null; sessions: Array<{ id: string; status: string; original_status: string }> }

let srv: TestServer;
beforeAll(async () => { freshDb(); srv = await startServer(); });
afterAll(async () => { await srv.close(); });

const SARA_ABSENCE = 'att_student_swe302_2026-09-21_0930';
const SARA_ABSENCE_2 = 'att_student_cis321_2026-09-22_1100';
const attendance = (id: string) => db().get<{ status: string; original_status: string; excuse_request_id: string | null }>('SELECT status, original_status, excuse_request_id FROM attendance_records WHERE id = ?', id)!;

describe('exact-session excuses', () => {
  it('binds a draft to exact attendance ids and rejects foreign or non-absent sessions', async () => {
    const sara = srv.as('u_student');
    const present = db().get<{ id: string }>(`SELECT id FROM attendance_records WHERE student_id = 'u_student' AND status = 'present' LIMIT 1`)!;
    const bad = await sara.post('/academics/excuses', { attendanceIds: [present.id], type: 'medical' });
    expect(bad.status).toBe(422);
    const foreign = await srv.as('u_lead').post('/academics/excuses', { attendanceIds: [SARA_ABSENCE], type: 'medical' });
    expect(foreign.status).toBe(403);
    const ok = await sara.post<Excuse>('/academics/excuses', { attendanceIds: [SARA_ABSENCE], type: 'medical' });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.attendance_ids).toEqual([SARA_ABSENCE]);
    expect(ok.body.data!.status).toBe('draft');
    expect(ok.body.data!.from_date).toBe('2026-09-21');
    const dup = await sara.post('/academics/excuses', { attendanceIds: [SARA_ABSENCE], type: 'medical' });
    expect(dup.status).toBe(409);
    // resolve free text against the demo clock
    const r = await sara.post<{ date: string; matches: Array<{ id: string }> }>('/academics/excuses/resolve', { text: 'last Tuesday CIS 321' });
    expect(r.body.data!.date).toBe('2026-09-22');
    expect(r.body.data!.matches.map((m) => m.id)).toEqual([SARA_ABSENCE_2]);
    // another student cannot read the draft
    const other = await srv.as('u_student2').get(`/academics/excuses/${ok.body.data!.id}`);
    expect(other.status).toBe(403);
  });

  it('only accepts evidence owned by the student and extracts editable fields', async () => {
    const sara = srv.as('u_student');
    const list = await sara.get<Excuse[]>('/academics/excuses');
    const ex = list.body.data!.find((e) => e.attendance_ids.includes(SARA_ABSENCE))!;
    const faisalDoc = db().get<{ id: string }>(`SELECT id FROM documents WHERE owner_id = 'u_student2' AND kind = 'medical'`)!;
    const foreign = await sara.post(`/academics/excuses/${ex.id}/evidence`, { documentId: faisalDoc.id });
    expect(foreign.status).toBe(403);
    const cv = createDocumentFromBuffer('u_student', 'cv', 'cv.pdf', 'application/pdf', makePdf(['CV']));
    const wrongKind = await sara.post(`/academics/excuses/${ex.id}/evidence`, { documentId: cv.id });
    expect(wrongKind.status).toBe(422);
    const saraDoc = db().get<{ id: string }>(`SELECT id FROM documents WHERE owner_id = 'u_student' AND kind = 'medical'`)!;
    const att = await sara.post<{ excuse: Excuse; extraction: { fromDate?: { value: string }; toDate?: { value: string }; reference?: { value: string }; patientName?: { value: string }; text: string } }>(`/academics/excuses/${ex.id}/evidence`, { documentId: saraDoc.id });
    expect(att.status).toBe(200);
    expect(att.body.data!.extraction.fromDate?.value).toBe('2026-09-21');
    expect(att.body.data!.extraction.toDate?.value).toBe('2026-09-22');
    expect(att.body.data!.extraction.reference?.value).toBe('SL-2026-000412');
    expect(att.body.data!.extraction.text).toBe(''); // raw medical text never leaves the server
    expect(att.body.data!.excuse.document_ids).toEqual([saraDoc.id]);
    expect(att.body.data!.excuse.checks.find((c) => c.id === 'name')!.status).toBe('pass');
    // edited dates that do not cover the session raise a warning, not a silent pass
    const edit = await sara.put<Excuse>(`/academics/excuses/${ex.id}`, { reason: 'Sick leave issued by the clinic for a respiratory infection.', from_date: '2026-09-23', to_date: '2026-09-24' });
    expect(edit.body.data!.checks.find((c) => c.id === 'coverage')!.status).toBe('warn');
    const fix = await sara.put<Excuse>(`/academics/excuses/${ex.id}`, { from_date: '2026-09-21', to_date: '2026-09-22' });
    expect(fix.body.data!.status).toBe('ready');
  });

  it('requires explicit approval, invalidates it on edit, submits once and leaves attendance untouched', async () => {
    const sara = srv.as('u_student');
    const ex = (await sara.get<Excuse[]>('/academics/excuses')).body.data!.find((e) => e.attendance_ids.includes(SARA_ABSENCE))!;
    const a1 = await sara.post<{ approval: { id: string }; review: { files: string[]; department: string } }>(`/academics/excuses/${ex.id}/approve`);
    expect(a1.status).toBe(200);
    expect(a1.body.data!.review.files.length).toBe(1);
    const edit = await sara.put<Excuse>(`/academics/excuses/${ex.id}`, { reason: 'Sick leave issued by the clinic for a respiratory infection (updated).' });
    expect(edit.body.data!.approval_id).toBeNull();
    expect(edit.body.data!.status).toBe('ready');
    const stale = await sara.post(`/academics/excuses/${ex.id}/submit`, { approvalId: a1.body.data!.approval.id });
    expect(stale.status).toBe(409);
    const a2 = await sara.post<{ approval: { id: string } }>(`/academics/excuses/${ex.id}/approve`);
    const sub = await sara.post<{ excuse: Excuse; receipt: { portal_request_id: string; label: string }; replayed: boolean }>(`/academics/excuses/${ex.id}/submit`, { approvalId: a2.body.data!.approval.id });
    expect(sub.status).toBe(200);
    expect(sub.body.data!.receipt.label).toBe('Demo submission');
    expect(sub.body.data!.receipt.portal_request_id).toMatch(/^EX-2026-\d{4}$/);
    expect(sub.body.data!.excuse.status).toBe('under_review');
    const again = await sara.post<{ replayed: boolean; receipt: { portal_request_id: string } }>(`/academics/excuses/${ex.id}/submit`, { approvalId: a2.body.data!.approval.id });
    expect(again.body.data!.replayed).toBe(true);
    expect(again.body.data!.receipt.portal_request_id).toBe(sub.body.data!.receipt.portal_request_id);
    expect(attendance(SARA_ABSENCE).status).toBe('absent');
    const locked = await sara.put(`/academics/excuses/${ex.id}`, { reason: 'x' });
    expect(locked.status).toBe(409);
  });

  it('restricts the review queue to reviewers and applies the accepted treatment while keeping the original status', async () => {
    for (const persona of ['u_lead', 'u_security', 'u_student']) {
      const q = await srv.as(persona).get('/academics/review/excuses');
      expect(q.status).toBe(403);
    }
    const reviewer = srv.as('u_reviewer');
    const queue = await reviewer.get<Array<Excuse & { student_name_en: string }>>('/academics/review/excuses');
    expect(queue.status).toBe(200);
    const ex = queue.body.data!.find((e) => e.attendance_ids.includes(SARA_ABSENCE))!;
    expect(ex.student_name_en).toBe('Sara Al-Otaibi');
    // reviewer can open the evidence while under review
    const detail = await reviewer.get<Excuse>(`/academics/review/excuses/${ex.id}`);
    const doc = await reviewer.get(`/documents/${detail.body.data!.document_ids[0]}`);
    expect(doc.status).toBe(200);
    const leadDoc = await srv.as('u_lead').get(`/documents/${detail.body.data!.document_ids[0]}`);
    expect(leadDoc.status).toBe(403);
    const noNote = await reviewer.post(`/academics/review/excuses/${ex.id}/decision`, { decision: 'accepted', note: '' });
    expect(noNote.status).toBe(400);
    const dec = await reviewer.post<Excuse>(`/academics/review/excuses/${ex.id}/decision`, { decision: 'accepted', note: 'Report covers the session date.' });
    expect(dec.status).toBe(200);
    expect(dec.body.data!.status).toBe('accepted');
    const a = attendance(SARA_ABSENCE);
    expect(a.status).toBe('excused');
    expect(a.original_status).toBe('absent');
    expect(a.excuse_request_id).toBe(ex.id);
    // student was notified with a link to the request
    const n = db().get<{ link: string }>(`SELECT link FROM notifications WHERE user_id = 'u_student' AND kind = 'excuse_accepted' ORDER BY created_at DESC`)!;
    expect(n.link).toBe(`/academics/excuses/${ex.id}`);
    // evidence is no longer grantable once the request is decided
    const after = await reviewer.get(`/documents/${detail.body.data!.document_ids[0]}`);
    expect(after.status).toBe(403);
    // reviewer cannot edit the student's reason
    const edit = await reviewer.put(`/academics/excuses/${ex.id}`, { reason: 'changed by reviewer' });
    expect(edit.status).toBe(403);
  });

  it('needs_information sends the request back to the student and keeps the full history', async () => {
    const reviewer = srv.as('u_reviewer');
    const seeded = 'exc_faisal_seed_01';
    const dec = await reviewer.post<Excuse & { history: Array<{ action: string }> }>(`/academics/review/excuses/${seeded}/decision`, { decision: 'needs_information', note: 'Please attach the second page of the report.' });
    expect(dec.status).toBe(200);
    expect(dec.body.data!.status).toBe('needs_information');
    expect(dec.body.data!.history.map((h) => h.action)).toEqual(expect.arrayContaining(['created', 'submitted', 'under_review', 'needs_information']));
    const faisal = srv.as('u_student2');
    const edit = await faisal.put<Excuse>(`/academics/excuses/${seeded}`, { reason: 'Fever and flu symptoms; second page attached as requested.' });
    expect(edit.status).toBe(200);
    expect(edit.body.data!.status).toBe('needs_information');
    expect(attendance('att_student2_cne200_2026-09-16_0930').status).toBe('absent');
  });
});
