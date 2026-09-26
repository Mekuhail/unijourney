import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { upsertEntry } from '../server/core/calendar.ts';

interface App { id: string; status: string; company: string; title: string; applied_at: string | null; attested_by: string | null; duplicate?: boolean; event?: { source: string; from_status: string | null; to_status: string; note: string | null }; events?: Array<{ from_status: string | null; to_status: string; source: string }> }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('career tracker', () => {
  it('creates at most one application per (student, opportunity)', async () => {
    const c = s.as('u_student');
    const a = await c.post<App>('/career/applications', { opportunityId: 'opp_farq_hackathon' });
    expect(a.status).toBe(201);
    expect(a.body.data!.duplicate).toBe(false);
    expect(a.body.data!.status).toBe('saved');
    const b = await c.post<App>('/career/applications', { opportunityId: 'opp_farq_hackathon' });
    expect(b.status).toBe(200);
    expect(b.body.data!.duplicate).toBe(true);
    expect(b.body.data!.id).toBe(a.body.data!.id);
    expect(db().count('applications', 'student_id = ? AND opportunity_id = ?', 'u_student', 'opp_farq_hackathon')).toBe(1);
    // a different student can track the same opportunity independently
    const other = await s.as('u_student2').post<App>('/career/applications', { opportunityId: 'opp_farq_hackathon' });
    expect(other.status).toBe(201);
  });

  it('keeps distinct manual applications to the same company distinct', async () => {
    const c = s.as('u_student');
    const a = await c.post<App>('/career/applications', { company: 'Same Co', title: 'Role A', type: 'internship' });
    const b = await c.post<App>('/career/applications', { company: 'Same Co', title: 'Role B', type: 'internship' });
    expect(a.status).toBe(201); expect(b.status).toBe(201);
    expect(a.body.data!.id).not.toBe(b.body.data!.id);
    const missing = await c.post('/career/applications', { company: 'Same Co' });
    expect(missing.status).toBe(400);
  });

  it('enforces forward transitions, attestation for applied and notes for corrections', async () => {
    const c = s.as('u_student');
    const app = (await c.post<App>('/career/applications', { company: 'Transition Co', title: 'QA intern', type: 'internship' })).body.data!;
    const noAttest = await c.post('/career/applications/' + app.id + '/status', { status: 'applied' });
    expect(noAttest.status).toBe(422);
    expect((noAttest.body.error!.details as { attestation_required: boolean }).attestation_required).toBe(true);
    const applied = await c.post<App>('/career/applications/' + app.id + '/status', { status: 'applied', attest: true, note: 'Submitted on the portal' });
    expect(applied.status).toBe(200);
    expect(applied.body.data!.status).toBe('applied');
    expect(applied.body.data!.applied_at).toBeTruthy();
    expect(applied.body.data!.attested_by).toBe('student');
    expect(applied.body.data!.event!.source).toBe('manual');
    const same = await c.post('/career/applications/' + app.id + '/status', { status: 'applied', attest: true });
    expect(same.status).toBe(400);
    const back = await c.post('/career/applications/' + app.id + '/status', { status: 'preparing' });
    expect(back.status).toBe(422);
    expect((back.body.error!.details as { correction_required: boolean }).correction_required).toBe(true);
    const noNote = await c.post('/career/applications/' + app.id + '/status', { status: 'preparing', correction: true });
    expect(noNote.status).toBe(422);
    const corrected = await c.post<App>('/career/applications/' + app.id + '/status', { status: 'preparing', correction: true, note: 'Clicked the wrong status' });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data!.event!.source).toBe('correction');
    const detail = await c.get<App>('/career/applications/' + app.id);
    expect(detail.body.data!.events!.map((e) => `${e.from_status}>${e.to_status}:${e.source}`)).toEqual(['null>saved:manual', 'saved>applied:manual', 'applied>preparing:correction']);
    // skipping stages forward is fine; leaving a terminal status needs a correction
    const offer = await c.post<App>('/career/applications/' + app.id + '/status', { status: 'rejected', note: 'Position filled' });
    expect(offer.status).toBe(200);
    const revive = await c.post('/career/applications/' + app.id + '/status', { status: 'interview' });
    expect(revive.status).toBe(422);
  });

  it('records an interview exactly once on the calendar and reports a class conflict', async () => {
    const c = s.as('u_student');
    const app = (await c.post<App>('/career/applications', { company: 'Calendar Co', title: 'Intern', type: 'internship' })).body.data!;
    upsertEntry('u_student', { source_type: 'section', source_id: 'test-section:2026-10-05:10:00', title: 'CIS 321 Operating Systems', kind: 'class', start_at: '2026-10-05T10:00:00+03:00', end_at: '2026-10-05T11:15:00+03:00', immovable: true });
    const r = await c.post<{ interview: { id: string }; conflicts: Array<{ entry: { kind: string; title: string }; overlapMinutes: number }>; statusChanged: boolean; application: App }>('/career/applications/' + app.id + '/interviews', { start_at: '2026-10-05T10:30:00+03:00', end_at: '2026-10-05T11:30:00+03:00', link: 'https://meet.example-demo.sa/x', kind: 'technical', advance: true });
    expect(r.status).toBe(201);
    // at least the class we inserted (the academics seed may add more timetable overlaps)
    const mine = r.body.data!.conflicts.find((c) => c.entry.title === 'CIS 321 Operating Systems')!;
    expect(mine).toBeTruthy();
    expect(mine.entry.kind).toBe('class');
    expect(mine.overlapMinutes).toBe(45);
    expect(r.body.data!.conflicts.every((c) => c.entry.kind !== 'interview')).toBe(true);
    expect(r.body.data!.statusChanged).toBe(true);
    expect(r.body.data!.application.status).toBe('interview');
    const iid = r.body.data!.interview.id;
    const entries = db().all("SELECT * FROM calendar_entries WHERE owner_id = 'u_student' AND source_type = 'interview' AND source_id = ?", iid);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('interview');
    expect(entries[0].link).toBe('/career/applications/' + app.id);
    const del = await c.del('/career/interviews/' + iid);
    expect(del.status).toBe(200);
    expect(db().count('calendar_entries', "source_type = 'interview' AND source_id = ?", iid)).toBe(0);
    expect(db().count('interviews', 'id = ?', iid)).toBe(0);
  });

  it('rejects cross-student reads and writes with 403', async () => {
    const sara = s.as('u_student');
    const app = (await sara.post<App>('/career/applications', { company: 'Private Co', title: 'Intern', type: 'internship' })).body.data!;
    const other = s.as('u_student2');
    expect((await other.get('/career/applications/' + app.id)).status).toBe(403);
    expect((await other.put('/career/applications/' + app.id, { notes: 'hijack' })).status).toBe(403);
    expect((await other.post('/career/applications/' + app.id + '/status', { status: 'withdrawn', note: 'x' })).status).toBe(403);
    expect((await other.post('/career/applications/' + app.id + '/interviews', { start_at: '2026-10-06T10:00:00+03:00', end_at: '2026-10-06T11:00:00+03:00' })).status).toBe(403);
    // staff roles have no access to career records either
    expect((await s.as('u_admissions').get('/career/applications/' + app.id)).status).toBe(403);
    const list = await other.get<{ items: App[] }>('/career/applications');
    expect(list.body.data!.items.some((a) => a.id === app.id)).toBe(false);
  });

  it('prepare returns a labelled draft that is never submitted', async () => {
    const c = s.as('u_student');
    const list = await c.get<{ items: App[] }>('/career/applications');
    const app = list.body.data!.items.find((a) => a.company === 'AraTech Digital')!;
    const r = await c.post<{ label: string; simulated: boolean; provider: string; fields: Record<string, unknown>; cover_note: string; missing_skills: string[] }>('/career/applications/' + app.id + '/prepare');
    expect(r.status).toBe(200);
    expect(r.body.data!.simulated).toBe(true);
    expect(r.body.data!.label).toMatch(/nothing is submitted/i);
    expect(r.body.data!.fields.full_name).toBe('Sara Al-Otaibi');
    expect(r.body.data!.cover_note).toContain('AraTech Digital');
    expect(r.body.data!.cover_note).not.toContain('Node.js experience');
    expect(r.body.data!.missing_skills).toContain('Node.js');
    expect(db().count('applications', 'id = ? AND status = ?', app.id, 'saved')).toBe(1);
  });
});
