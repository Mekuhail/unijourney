import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, conflict } from '../../core/http.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { newId, stableHash } from '../../core/ids.ts';
import { nowIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import type { User } from '../../../shared/types.ts';
import { eventTags, getClub, getEvent, isLeadOf, isPast, locationSummary, nowLocalIso, requireLeadOf, userBrief, type ClubRow, type EventRow } from './shared.ts';
import { communitySummary, profileOf, recommendFor } from './community.ts';

export const clubsRouter = Router();

// ------------------------------------------------------------------ helpers
function membershipOf(clubId: string, userId: string) {
  return db().get('SELECT * FROM memberships WHERE club_id = ? AND user_id = ?', clubId, userId) ?? null;
}

function clubView(c: ClubRow, u: User) {
  const userId = u.id;
  const mine = membershipOf(c.id, userId);
  const member_count = db().count('memberships', "club_id = ? AND status = 'active'", c.id);
  const pending_count = db().count('memberships', "club_id = ? AND status = 'pending'", c.id);
  const upcoming_events = db().count('events', "club_id = ? AND end_at >= ? AND status <> 'cancelled'", c.id, nowLocalIso());
  const tracks = [...new Set(db().all<{ tags: string }>('SELECT tags FROM events WHERE club_id = ?', c.id).flatMap((r) => eventTags(r as unknown as EventRow)).filter((t) => t.startsWith('track:')).map((t) => t.slice(6)))];
  return {
    ...c,
    lead: userBrief(c.lead_id),
    my_membership: mine ? { id: mine.id, status: mine.status, role: mine.role, requested_at: mine.requested_at, decided_at: mine.decided_at, note: mine.note } : null,
    member_count,
    pending_count,
    upcoming_events,
    tracks,
    ...communitySummary(c, u)
  };
}

// ------------------------------------------------------------------ directory
clubsRouter.get('/clubs', h((req, res) => {
  const u = requireUser(req);
  const rows = db().all<ClubRow>('SELECT * FROM clubs ORDER BY name_en');
  ok(res, rows.map((c) => ({ ...clubView(c, u), is_lead: isLeadOf(u, c), for_you: recommendFor(c, u) })));
}));

clubsRouter.get('/clubs/:id', h((req, res) => {
  const u = requireUser(req);
  const c = getClub(req.params.id as string);
  const lead = isLeadOf(u, c);
  const events = db().all<EventRow>("SELECT * FROM events WHERE club_id = ? AND status <> 'cancelled' ORDER BY start_at", c.id).map((e) => ({
    ...e,
    tags: eventTags(e),
    location: locationSummary(e.location_id),
    going_count: db().count('rsvps', "event_id = ? AND status = 'going'", e.id),
    my_rsvp: (db().get('SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, u.id)?.status as string | undefined) ?? null,
    upcoming: !isPast(e.end_at)
  }));
  // Roster: the lead sees every membership row; active members see fellow members' names and programmes; everyone
  // else sees only the officers (in clubView) and the count. Student numbers are never shown here.
  const isActive = membershipOf(c.id, u.id)?.status === 'active';
  const members = lead
    ? db().all("SELECT m.id, m.user_id, m.status, m.role, m.requested_at, m.decided_at, m.note, u.name_en, u.name_ar, u.avatar_color, u.program_id, u.level, t.title_en, t.title_ar, a.answer FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN club_member_titles t ON t.membership_id = m.id LEFT JOIN club_join_answers a ON a.membership_id = m.id WHERE m.club_id = ? AND m.status IN ('active','pending') ORDER BY CASE m.role WHEN 'lead' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.requested_at", c.id)
    : isActive
      ? db().all("SELECT m.id, m.user_id, m.status, m.role, m.requested_at, u.name_en, u.name_ar, u.avatar_color, u.program_id, t.title_en, t.title_ar FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN club_member_titles t ON t.membership_id = m.id WHERE m.club_id = ? AND m.status = 'active' ORDER BY CASE m.role WHEN 'lead' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.requested_at", c.id)
      : [];
  ok(res, { ...clubView(c, u), is_lead: lead, events, members, roster_visible: lead || isActive });
}));

// ------------------------------------------------------------------ join / leave
clubsRouter.post('/clubs/:id/join', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'student', 'club_lead')) throw forbidden('Only students can join clubs');
  const c = getClub(req.params.id as string);
  const body = parse(z.object({ answer: z.string().trim().max(500).optional() }), req.body ?? {});
  const existing = membershipOf(c.id, u.id);
  const now = nowIso();
  // Open clubs admit at once; approval clubs create a request for the lead (Engage / CampusGroups join models).
  const policy = profileOf(c.id).join_policy;
  const status = policy === 'open' ? 'active' : 'pending';
  const result = db().tx(() => {
    if (existing && (existing.status === 'pending' || existing.status === 'active')) return { membership: existing, created: false };
    let id: string;
    if (existing) {
      id = existing.id as string;
      db().update('memberships', id, { status, role: 'member', requested_at: now, decided_at: status === 'active' ? now : null, decided_by: null, note: null });
    } else {
      id = newId('mem');
      db().insert('memberships', { id, club_id: c.id, user_id: u.id, status, role: 'member', requested_at: now, decided_at: status === 'active' ? now : null, decided_by: null, note: null });
    }
    if (body.answer) db().run('INSERT INTO club_join_answers (membership_id, answer, created_at) VALUES (?, ?, ?) ON CONFLICT(membership_id) DO UPDATE SET answer = excluded.answer, created_at = excluded.created_at', id, body.answer, now);
    if (c.lead_id && status === 'pending') notify(c.lead_id, { module: 'campus', kind: 'membership_request', title: `New join request: ${c.name_en}`, body: `${u.name_en} asked to join. Review it in the club desk.`, link: '/staff/campus/clubs' });
    audit(u.id, 'club.join', 'membership', c.id, { policy });
    return { membership: membershipOf(c.id, u.id), created: true };
  });
  ok(res, { ...result, club: clubView(c, u) }, result.created ? 201 : 200);
}));

clubsRouter.post('/clubs/:id/leave', h((req, res) => {
  const u = requireUser(req);
  const c = getClub(req.params.id as string);
  const existing = membershipOf(c.id, u.id);
  if (!existing) throw notFound('You are not a member of this club');
  if (existing.status === 'left') return ok(res, { membership: existing, club: clubView(c, u) });
  if (c.lead_id === u.id) throw conflict('A club lead cannot leave their own club in the demo; hand over leadership first');
  db().update('memberships', existing.id as string, { status: 'left', role: 'member', decided_at: nowIso(), decided_by: u.id });
  db().run('DELETE FROM club_member_titles WHERE membership_id = ?', existing.id as string);
  audit(u.id, 'club.leave', 'membership', existing.id as string, {});
  ok(res, { membership: membershipOf(c.id, u.id), club: clubView(c, u) });
}));

// ------------------------------------------------------------------ lead: requests
clubsRouter.get('/clubs/:id/requests', h((req, res) => {
  const c = getClub(req.params.id as string);
  requireLeadOf(req, c);
  const rows = db().all("SELECT m.*, u.name_en, u.name_ar, u.avatar_color, u.student_no, u.program_id, u.level, a.answer FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN club_join_answers a ON a.membership_id = m.id WHERE m.club_id = ? AND m.status = 'pending' ORDER BY m.requested_at", c.id);
  ok(res, rows);
}));

clubsRouter.post('/clubs/:id/requests/:membershipId/decide', h((req, res) => {
  const c = getClub(req.params.id as string);
  const lead = requireLeadOf(req, c);
  const body = parse(z.object({ decision: z.enum(['active', 'rejected']), note: z.string().max(400).optional() }), req.body);
  const m = db().get('SELECT * FROM memberships WHERE id = ? AND club_id = ?', req.params.membershipId as string, c.id);
  if (!m) throw notFound('Membership request not found in this club');
  if (m.status !== 'pending') throw conflict(`Request already ${m.status}`);
  db().tx(() => {
    db().update('memberships', m.id as string, { status: body.decision, decided_at: nowIso(), decided_by: lead.id, note: body.note ?? null });
    notify(m.user_id as string, {
      module: 'campus', kind: 'membership_decision',
      title: body.decision === 'active' ? `Welcome to ${c.name_en}` : `Join request declined: ${c.name_en}`,
      body: body.note ?? (body.decision === 'active' ? 'Your membership is now active.' : 'The club lead declined your request.'),
      link: `/campus/clubs/${c.id}`
    });
    audit(lead.id, 'club.membership.decide', 'membership', m.id as string, { decision: body.decision });
  });
  ok(res, db().get('SELECT * FROM memberships WHERE id = ?', m.id as string));
}));

// ------------------------------------------------------------------ achievements & digital card
/** Verifies a participant's attendance at an event → creates a demo achievement. Requires a 'going' RSVP (demonstrated participation). */
clubsRouter.post('/events/:id/attendance/:userId/verify', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  const club = e.club_id ? getClub(e.club_id) : null;
  const allowed = hasRole(u, 'reviewer') || (club ? isLeadOf(u, club) : false);
  if (!allowed) throw forbidden('Only the club lead of this event or a reviewer can verify attendance');
  const targetId = req.params.userId as string;
  const target = userBrief(targetId);
  if (!target) throw notFound('User not found');
  const rsvp = db().get('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, targetId);
  if (!rsvp || rsvp.status !== 'going') throw conflict('No confirmed RSVP for this participant; attendance cannot be verified');
  const existing = db().get('SELECT * FROM achievements WHERE user_id = ? AND event_id = ?', targetId, e.id);
  if (existing) return ok(res, { achievement: existing, created: false });
  const body = parse(z.object({ title_en: z.string().max(160).optional(), title_ar: z.string().max(160).optional(), kind: z.enum(['participation', 'organizer', 'winner', 'volunteer']).optional() }), req.body ?? {});
  const row = {
    id: newId('ach'), user_id: targetId,
    title_en: body.title_en ?? `Participated in ${e.title_en}`,
    title_ar: body.title_ar ?? (e.title_ar ? `المشاركة في ${e.title_ar}` : ''),
    kind: body.kind ?? 'participation', event_id: e.id, club_id: e.club_id, verified_by: u.id, evidence_document_id: null, created_at: nowIso()
  };
  db().tx(() => {
    db().insert('achievements', row);
    notify(targetId, { module: 'campus', kind: 'achievement', title: 'Participation verified', body: `${u.name_en} verified your attendance at ${e.title_en}. It now appears on your portfolio.`, link: '/portfolio#activities-h' });
    audit(u.id, 'achievement.verify', 'achievement', row.id, { event_id: e.id, user_id: targetId });
  });
  ok(res, { achievement: row, created: true }, 201);
}));

clubsRouter.get('/events/:id/participants', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  const club = e.club_id ? getClub(e.club_id) : null;
  if (!(hasRole(u, 'reviewer') || (club ? isLeadOf(u, club) : false))) throw forbidden();
  const rows = db().all('SELECT r.*, u.name_en, u.name_ar, u.avatar_color, u.student_no, (SELECT id FROM achievements a WHERE a.user_id = r.user_id AND a.event_id = r.event_id) AS achievement_id FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY r.created_at', e.id);
  ok(res, rows);
}));

clubsRouter.get('/me/card', h((req, res) => {
  const u = requireUser(req);
  const program = u.program_id ? db().get('SELECT code, name_en, name_ar FROM programs WHERE id = ?', u.program_id) : null;
  const campus = db().get('SELECT id, name_en, name_ar FROM campuses WHERE id = ?', u.campus_id);
  const memberships = db().all("SELECT m.role, m.requested_at, m.decided_at, c.id AS club_id, c.name_en, c.name_ar, c.color, c.category FROM memberships m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.requested_at", u.id);
  const achievements = db().all('SELECT a.*, e.title_en AS event_title_en, e.start_at AS event_start_at, c.name_en AS club_name_en, v.name_en AS verified_by_name FROM achievements a LEFT JOIN events e ON e.id = a.event_id LEFT JOIN clubs c ON c.id = a.club_id LEFT JOIN users v ON v.id = a.verified_by WHERE a.user_id = ? ORDER BY a.created_at DESC', u.id);
  const hash = stableHash({ id: u.id, student_no: u.student_no, issued: 'demo' }).slice(0, 16);
  ok(res, {
    user: { id: u.id, name_en: u.name_en, name_ar: u.name_ar, student_no: u.student_no, stage: u.stage, level: u.level, avatar_color: u.avatar_color },
    program: program ? { code: program.code, name_en: program.name_en, name_ar: program.name_ar } : (u.program_id ? { code: u.program_id.toUpperCase(), name_en: u.program_id.toUpperCase(), name_ar: u.program_id.toUpperCase() } : null),
    campus,
    memberships,
    achievements,
    qr: { payload: `uj:card:${u.id}:${hash}`, demo: true, note: 'Demo QR for the prototype. Possessing this code is not proof of enrolment or authorization; verification would require the university identity provider.' },
    issued_at: nowIso()
  });
}));
