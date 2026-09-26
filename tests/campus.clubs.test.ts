import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';

let s: TestServer;
beforeAll(async () => {
  freshDb();
  // A second club lead (synthetic) for the cross-club permission checks.
  db().insert('users', { id: 'u_lead2', roles: '["student","club_lead"]', name_en: 'Test Lead Two', name_ar: 'قائد اختبار', email: 'lead2@yu-demo.invalid', student_no: '202300099', program_id: 'bse', campus_id: 'riyadh', stage: 'current', level: 5, locale: 'en', interests: '[]', skills: '[]', preferences: '{}', avatar_color: '#000', department: null, created_at: '2026-09-01T00:00:00Z' });
  db().update('clubs', 'club_entrepreneurship', { lead_id: 'u_lead2' });
  s = await startServer();
});
afterAll(async () => { await s.close(); });

describe('clubs: join → lead approve → active', () => {
  it('creates a pending membership and the lead of THAT club can approve it', async () => {
    const sara = s.as('u_student');
    const join = await sara.post<{ membership: { id: string; status: string }; created: boolean }>('/campus/clubs/club_debate/join');
    expect(join.status).toBe(201);
    expect(join.body.data!.membership.status).toBe('pending');
    // duplicate join returns the existing row
    const again = await sara.post<{ membership: { id: string; status: string }; created: boolean }>('/campus/clubs/club_debate/join');
    expect(again.status).toBe(200);
    expect(again.body.data!.created).toBe(false);
    expect(again.body.data!.membership.id).toBe(join.body.data!.membership.id);

    // Faisal's seeded request in GDG is approved by Layan (GDG lead)
    const layan = s.as('u_lead');
    const queue = await layan.get<Array<{ id: string; user_id: string }>>('/campus/clubs/club_gdg/requests');
    expect(queue.status).toBe(200);
    const req = queue.body.data!.find((m) => m.user_id === 'u_student2')!;
    expect(req).toBeTruthy();
    const decide = await layan.post<{ status: string }>(`/campus/clubs/club_gdg/requests/${req.id}/decide`, { decision: 'active', note: 'Welcome' });
    expect(decide.status).toBe(200);
    expect(decide.body.data!.status).toBe('active');
    const faisal = s.as('u_student2');
    const club = await faisal.get<{ my_membership: { status: string } }>('/campus/clubs/club_gdg');
    expect(club.body.data!.my_membership.status).toBe('active');
    expect(db().count('notifications', "user_id = 'u_student2' AND kind = 'membership_decision'")).toBe(1);
  });

  it("another club's lead gets 403 on the GDG queue and on decisions", async () => {
    const lead2 = s.as('u_lead2');
    const queue = await lead2.get('/campus/clubs/club_gdg/requests');
    expect(queue.status).toBe(403);
    const sara = s.as('u_student');
    const join = await sara.post<{ membership: { id: string } }>('/campus/clubs/club_volunteer/join');
    const mid = join.body.data!.membership.id;
    // u_lead is not the lead of the volunteering club either
    const wrongLead = await s.as('u_lead').post(`/campus/clubs/club_volunteer/requests/${mid}/decide`, { decision: 'active' });
    expect(wrongLead.status).toBe(403);
    // a plain student cannot decide
    const student = await sara.post(`/campus/clubs/club_volunteer/requests/${mid}/decide`, { decision: 'active' });
    expect(student.status).toBe(403);
    // and lead2 CAN act on their own club
    const ok = await lead2.get('/campus/clubs/club_entrepreneurship/requests');
    expect(ok.status).toBe(200);
  });

  it('leave keeps the row with status left', async () => {
    const sara = s.as('u_student');
    const r = await sara.post<{ membership: { status: string } }>('/campus/clubs/club_debate/leave');
    expect(r.status).toBe(200);
    expect(r.body.data!.membership.status).toBe('left');
    expect(db().count('memberships', "club_id = 'club_debate' AND user_id = 'u_student'")).toBe(1);
  });
});

describe('role boundaries between staff desks', () => {
  it('a club lead gets 403 on security routes', async () => {
    const layan = s.as('u_lead');
    expect((await layan.get('/campus/security/lost-found')).status).toBe(403);
    expect((await layan.get('/campus/security/found-items')).status).toBe(403);
    expect((await layan.post('/campus/security/lost-found/lf_sara_backpack/found', { collection_location_id: 'ryd_security' })).status).toBe(403);
  });
  it('security gets 403 on review queues', async () => {
    const sec = s.as('u_security');
    expect((await sec.get('/campus/moderation/resources')).status).toBe(403);
    expect((await sec.get('/campus/clubs/club_gdg/requests')).status).toBe(403);
  });
});

describe('achievements & digital card', () => {
  it('verify attendance needs a going RSVP and the right role; card exposes a demo QR', async () => {
    const layan = s.as('u_lead');
    const noRsvp = await layan.post('/campus/events/evt_gdg_past_ts/attendance/u_graduating/verify', {});
    expect(noRsvp.status).toBe(409);
    const ok = await layan.post<{ created: boolean; achievement: { user_id: string } }>('/campus/events/evt_gdg_past_ts/attendance/u_student/verify', {});
    expect(ok.status).toBe(201);
    expect(ok.body.data!.achievement.user_id).toBe('u_student');
    const wrongLead = await s.as('u_lead2').post('/campus/events/evt_gdg_past_ts/attendance/u_student/verify', {});
    expect(wrongLead.status).toBe(403);
    const card = await s.as('u_student').get<{ qr: { payload: string; demo: boolean }; achievements: unknown[]; memberships: unknown[] }>('/campus/me/card');
    expect(card.status).toBe(200);
    expect(card.body.data!.qr.payload.startsWith('uj:card:u_student:')).toBe(true);
    expect(card.body.data!.qr.demo).toBe(true);
    expect(card.body.data!.achievements.length).toBe(1);
  });
});
