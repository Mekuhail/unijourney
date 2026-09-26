import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { upsertEntry } from '../server/core/calendar.ts';

let s: TestServer;
beforeAll(async () => {
  freshDb();
  // A class meeting for Sara that overlaps the CTF (Thu 2026-10-04 11:00–13:00) – what the academics module would seed.
  upsertEntry('u_student', { source_type: 'section', source_id: 'sec_test_cis321:2026-10-04:11:00', title: 'CIS 321 Operating Systems (test section)', kind: 'class', start_at: '2026-10-04T11:00:00+03:00', end_at: '2026-10-04T12:15:00+03:00', location_id: 'ryd_room_b204', location_text: 'B-204', immovable: true });
  db().insert('attendance_records', { id: 'att_test_1', student_id: 'u_student', section_id: 'sec_test_cis321', course_code: 'CIS 321', session_date: '2026-10-04', start_time: '11:00', end_time: '12:15', location_id: 'ryd_room_b204', status: 'present', original_status: 'present', excuse_request_id: null, updated_at: '2026-09-27T06:00:00Z' });
  s = await startServer();
});
afterAll(async () => { await s.close(); });

const calCount = (user: string, eventId: string) => db().count('calendar_entries', "owner_id = ? AND source_type = 'event' AND source_id = ?", user, eventId);

describe('RSVP → exactly one calendar entry', () => {
  it('creates one entry, refuses a duplicate RSVP, and cancel removes it', async () => {
    const sara = s.as('u_student');
    const r1 = await sara.post<{ rsvp: { status: string }; conflicts: unknown[] }>('/campus/events/evt_gdg_gamejam/rsvp');
    expect(r1.status).toBe(201);
    expect(r1.body.data!.rsvp.status).toBe('going');
    expect(calCount('u_student', 'evt_gdg_gamejam')).toBe(1);
    const r2 = await sara.post('/campus/events/evt_gdg_gamejam/rsvp');
    expect(r2.status).toBe(409);
    expect(calCount('u_student', 'evt_gdg_gamejam')).toBe(1);
    const c = await sara.del<{ cancelled: boolean }>('/campus/events/evt_gdg_gamejam/rsvp');
    expect(c.status).toBe(200);
    expect(calCount('u_student', 'evt_gdg_gamejam')).toBe(0);
    // re-RSVP after cancel works and still yields exactly one entry
    const r3 = await sara.post('/campus/events/evt_gdg_gamejam/rsvp');
    expect(r3.status).toBe(201);
    expect(calCount('u_student', 'evt_gdg_gamejam')).toBe(1);
  });

  it('seeded RSVP has exactly one calendar entry (upsert idempotency)', () => {
    expect(calCount('u_student', 'evt_gdg_web')).toBe(1);
  });
});

describe('capacity → waitlist → promotion', () => {
  it('waitlists when full and promotes the first waitlisted user on cancel', async () => {
    // evt_gdg_mentoring: capacity 2, seeded going: u_lead, u_graduating; waitlisted: u_student2
    const sara = s.as('u_student');
    const r = await sara.post<{ rsvp: { status: string } }>('/campus/events/evt_gdg_mentoring/rsvp');
    expect(r.status).toBe(201);
    expect(r.body.data!.rsvp.status).toBe('waitlisted');
    expect(calCount('u_student', 'evt_gdg_mentoring')).toBe(0);
    // Noura cancels → Faisal (first waitlisted) is promoted, Sara stays waitlisted
    const c = await s.as('u_graduating').del<{ promoted_user_id: string | null }>('/campus/events/evt_gdg_mentoring/rsvp');
    expect(c.status).toBe(200);
    expect(c.body.data!.promoted_user_id).toBe('u_student2');
    expect(db().get('SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?', 'evt_gdg_mentoring', 'u_student2')!.status).toBe('going');
    expect(calCount('u_student2', 'evt_gdg_mentoring')).toBe(1);
    expect(calCount('u_graduating', 'evt_gdg_mentoring')).toBe(0);
    expect(db().count('notifications', "user_id = 'u_student2' AND kind = 'rsvp_promoted'")).toBe(1);
    expect(db().get('SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?', 'evt_gdg_mentoring', 'u_student')!.status).toBe('waitlisted');
  });
});

describe('conflict detection', () => {
  it('returns the overlapping class and offers an excuse draft with attendance ids', async () => {
    const sara = s.as('u_student');
    const detail = await sara.get<{ conflicts: Array<{ entry: { kind: string; title: string }; isClass: boolean }>; suggestions: { excuseDraftAvailable: boolean; attendanceIds: string[]; mapLink: string | null } }>('/campus/events/evt_gdg_ctf');
    expect(detail.status).toBe(200);
    const cls = detail.body.data!.conflicts.find((c) => c.entry.title.includes('CIS 321 Operating Systems (test section)'));
    expect(cls).toBeTruthy();
    expect(cls!.isClass).toBe(true);
    expect(detail.body.data!.suggestions.excuseDraftAvailable).toBe(true);
    expect(detail.body.data!.suggestions.attendanceIds).toContain('att_test_1');
    expect(detail.body.data!.suggestions.mapLink).toBe('/campus/map?to=ryd_auditorium');

    const r = await sara.post<{ conflicts: Array<{ entry: { kind: string } }>; suggestions: { excuseDraftAvailable: boolean } }>('/campus/events/evt_gdg_ctf/rsvp');
    expect(r.status).toBe(201);
    expect(r.body.data!.conflicts.some((c) => c.entry.kind === 'class')).toBe(true);
    expect(r.body.data!.suggestions.excuseDraftAvailable).toBe(true);
    // the RSVP's own calendar entry is never reported as a conflict
    expect(r.body.data!.conflicts.some((c) => (c.entry as { source_id?: string }).source_id === 'evt_gdg_ctf')).toBe(false);
  });

  it('personal events land on the calendar and other users cannot see them', async () => {
    const sara = s.as('u_student');
    const p = await sara.post<{ event: { id: string; kind: string } }>('/campus/events/personal', { title: 'Family lunch', start_at: '2026-10-02T13:00:00+03:00', end_at: '2026-10-02T14:00:00+03:00', location_text: 'Home' });
    expect(p.status).toBe(201);
    expect(db().count('calendar_entries', "owner_id = 'u_student' AND source_type = 'personal' AND source_id = ?", p.body.data!.event.id)).toBe(1);
    const other = await s.as('u_student2').get(`/campus/events/${p.body.data!.event.id}`);
    expect(other.status).toBe(404);
  });
});

describe('lead event editor', () => {
  it('only the club lead can create/edit club events', async () => {
    const body = { title_en: 'Test workshop', start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-12T17:00:00+03:00', location_id: 'ryd_room_d105', capacity: 10, track: 'Web Development' };
    expect((await s.as('u_student').post('/campus/clubs/club_gdg/events', body)).status).toBe(403);
    const created = await s.as('u_lead').post<{ id: string; tags: string[] }>('/campus/clubs/club_gdg/events', body);
    expect(created.status).toBe(201);
    expect(created.body.data!.tags).toContain('track:Web Development');
    const edited = await s.as('u_lead').put<{ capacity: number }>(`/campus/events/${created.body.data!.id}`, { capacity: 12 });
    expect(edited.status).toBe(200);
    expect(edited.body.data!.capacity).toBe(12);
    expect((await s.as('u_student2').put(`/campus/events/${created.body.data!.id}`, { capacity: 1 })).status).toBe(403);
  });
});
