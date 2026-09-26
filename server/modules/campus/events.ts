import { Router } from 'express';
import { z } from 'zod';
import { db, j } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, conflict, bad } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso, toLocal } from '../../core/clock.ts';
import { findConflicts, removeEntry, upsertEntry, type Conflict } from '../../core/calendar.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import type { User } from '../../../shared/types.ts';
import { eventTags, getClub, getEvent, getLocation, isLeadOf, isPast, locationSummary, requireLeadOf, type EventRow } from './shared.ts';
import { checkinState } from './community.ts';

export const eventsRouter = Router();

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/;

// ------------------------------------------------------------------ helpers
function venueText(e: EventRow): string {
  const loc = getLocation(e.location_id);
  if (loc) {
    const b = loc.building_id ? getLocation(loc.building_id) : null;
    return b ? `${loc.name_en} · ${b.name_en}` : loc.name_en;
  }
  return e.venue_text ?? '';
}

function goingCount(eventId: string): number {
  return db().count('rsvps', "event_id = ? AND status = 'going'", eventId);
}

function conflictsFor(userId: string, e: EventRow): Conflict[] {
  // Personal events are stored under source_type 'personal'; club/external/university RSVPs under 'event'.
  return findConflicts(userId, e.start_at, e.end_at, { source_type: e.kind === 'personal' ? 'personal' : 'event', source_id: e.id })
    .filter((c) => !(c.entry.source_type === 'event' && c.entry.source_id === e.id));
}

function eventView(e: EventRow, user: User, withConflicts = true) {
  const mine = db().get('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, user.id);
  const going = goingCount(e.id);
  const waitlisted = db().count('rsvps', "event_id = ? AND status = 'waitlisted'", e.id);
  const clubRow = e.club_id ? getClub(e.club_id) : null;
  const club = clubRow ? { id: clubRow.id, name_en: clubRow.name_en, name_ar: clubRow.name_ar, color: clubRow.color, lead_id: clubRow.lead_id } : null;
  const conflicts = withConflicts ? conflictsFor(user.id, e) : [];
  return {
    ...e,
    tags: eventTags(e),
    demo_label: !!e.demo_label,
    club,
    location: locationSummary(e.location_id),
    venue_label: venueText(e),
    going_count: going,
    waitlist_count: waitlisted,
    remaining: e.capacity === null ? null : Math.max(0, e.capacity - going),
    full: e.capacity !== null && going >= e.capacity,
    my_rsvp: mine ? { status: mine.status as string, created_at: mine.created_at as string } : null,
    conflicts: conflicts.map((c) => ({ entry: c.entry, overlapMinutes: c.overlapMinutes, isClass: c.entry.kind === 'class' || c.entry.kind === 'exam' })),
    can_edit: clubRow ? isLeadOf(user, clubRow) : e.owner_id === user.id,
    is_past: isPast(e.end_at),
    map_link: e.location_id ? `/campus/map?to=${e.location_id}` : null
  };
}

/** Attendance sessions (academics module data) overlapping the event window on the same local day. */
function overlappingAttendance(userId: string, e: EventRow): string[] {
  const s = toLocal(e.start_at), en = toLocal(e.end_at);
  if (s.date !== en.date) return [];
  return db().all<{ id: string }>('SELECT id FROM attendance_records WHERE student_id = ? AND session_date = ? AND start_time < ? AND end_time > ?', userId, s.date, en.time, s.time).map((r) => r.id);
}

function ensureVisible(e: EventRow, user: User) {
  if (e.kind === 'personal' && e.owner_id !== user.id) throw notFound('Event not found');
}

// ------------------------------------------------------------------ list / detail
eventsRouter.get('/events', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional(), kind: z.string().optional(), campus: z.string().optional(), club: z.string().optional(), mine: z.string().optional() }), req.query);
  const where: string[] = ["status <> 'cancelled'", "(kind <> 'personal' OR owner_id = ?)"];
  const params: unknown[] = [u.id];
  if (q.from) { where.push('end_at >= ?'); params.push(q.from.length === 10 ? `${q.from}T00:00:00+03:00` : q.from); }
  if (q.to) { where.push('start_at <= ?'); params.push(q.to.length === 10 ? `${q.to}T23:59:59+03:00` : q.to); }
  if (q.kind) { where.push('kind = ?'); params.push(q.kind); }
  if (q.campus) { where.push('(campus_id = ? OR campus_id IS NULL)'); params.push(q.campus); }
  if (q.club) { where.push('club_id = ?'); params.push(q.club); }
  if (q.mine === '1' || q.mine === 'true') { where.push("(owner_id = ? OR id IN (SELECT event_id FROM rsvps WHERE user_id = ? AND status IN ('going','waitlisted')))"); params.push(u.id, u.id); }
  const rows = db().all<EventRow>(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY start_at`, ...params);
  ok(res, rows.map((e) => eventView(e, u)));
}));

eventsRouter.get('/events/:id', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  ensureVisible(e, u);
  const view = eventView(e, u);
  const attendanceIds = overlappingAttendance(u.id, e);
  const checkin = e.kind === 'club' || e.kind === 'university' ? checkinState(e.id, u) : null;
  ok(res, { ...view, checkin, suggestions: { excuseDraftAvailable: view.conflicts.some((c) => c.isClass), attendanceIds, mapLink: view.map_link, studyRepairLink: '/academics/study?repair=event' } });
}));

// ------------------------------------------------------------------ RSVP
eventsRouter.post('/events/:id/rsvp', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  ensureVisible(e, u);
  if (e.kind === 'personal') throw bad('Personal events do not take RSVPs');
  if (isPast(e.end_at)) throw conflict('This event has already ended');
  const existing = db().get('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, u.id);
  if (existing && existing.status === 'going') throw conflict('You are already going to this event');
  if (existing && existing.status === 'waitlisted') throw conflict('You are already on the waitlist for this event');
  const now = nowIso();
  const result = db().tx(() => {
    const full = e.capacity !== null && goingCount(e.id) >= e.capacity;
    const status = full ? 'waitlisted' : 'going';
    if (existing) db().update('rsvps', existing.id as string, { status, updated_at: now });
    else db().insert('rsvps', { id: newId('rsvp'), event_id: e.id, user_id: u.id, status, created_at: now, updated_at: now });
    if (status === 'going') {
      // Exactly one calendar entry per (owner, 'event', event id) – upsertEntry is idempotent.
      upsertEntry(u.id, { source_type: 'event', source_id: e.id, title: e.title_en, kind: 'event', start_at: e.start_at, end_at: e.end_at, location_id: e.location_id, location_text: venueText(e), immovable: false, link: `/campus/events/${e.id}`, meta: { club_id: e.club_id, event_kind: e.kind } });
    }
    audit(u.id, 'event.rsvp', 'event', e.id, { status });
    return db().get('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, u.id)!;
  });
  const conflicts = conflictsFor(u.id, e);
  const classConflicts = conflicts.filter((c) => c.entry.kind === 'class' || c.entry.kind === 'exam');
  const attendanceIds = overlappingAttendance(u.id, e);
  ok(res, {
    rsvp: result,
    event: eventView(e, u),
    conflicts: conflicts.map((c) => ({ entry: c.entry, overlapMinutes: c.overlapMinutes, isClass: c.entry.kind === 'class' || c.entry.kind === 'exam' })),
    suggestions: {
      excuseDraftAvailable: classConflicts.length > 0,
      attendanceIds,
      mapLink: e.location_id ? `/campus/map?to=${e.location_id}` : null,
      studyRepairLink: '/academics/study?repair=event',
      note: classConflicts.length ? 'This event overlaps a class. Attending does not excuse the absence – you can draft an exact-session excuse for review.' : undefined
    }
  }, 201);
}));

eventsRouter.delete('/events/:id/rsvp', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  const existing = db().get('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?', e.id, u.id);
  if (!existing || existing.status === 'cancelled') throw notFound('No active RSVP for this event');
  const wasGoing = existing.status === 'going';
  const promoted = db().tx(() => {
    db().update('rsvps', existing.id as string, { status: 'cancelled', updated_at: nowIso() });
    removeEntry(u.id, 'event', e.id);
    audit(u.id, 'event.rsvp.cancel', 'event', e.id, {});
    if (!wasGoing) return null;
    // Promote the first waitlisted user when a seat frees up.
    const next = db().get("SELECT * FROM rsvps WHERE event_id = ? AND status = 'waitlisted' ORDER BY created_at LIMIT 1", e.id);
    if (!next) return null;
    if (e.capacity !== null && goingCount(e.id) >= e.capacity) return null;
    db().update('rsvps', next.id as string, { status: 'going', updated_at: nowIso() });
    upsertEntry(next.user_id as string, { source_type: 'event', source_id: e.id, title: e.title_en, kind: 'event', start_at: e.start_at, end_at: e.end_at, location_id: e.location_id, location_text: venueText(e), immovable: false, link: `/campus/events/${e.id}`, meta: { club_id: e.club_id, event_kind: e.kind } });
    notify(next.user_id as string, { module: 'campus', kind: 'rsvp_promoted', title: `A seat opened: ${e.title_en}`, body: 'You moved from the waitlist to going. The event is now on your calendar.', link: `/campus/events/${e.id}` });
    return next.user_id as string;
  });
  ok(res, { cancelled: true, promoted_user_id: promoted, event: eventView(e, u) });
}));

// ------------------------------------------------------------------ personal events
const personalSchema = z.object({
  title: z.string().min(2).max(140),
  start_at: z.string().regex(ISO_RE),
  end_at: z.string().regex(ISO_RE),
  location_text: z.string().max(140).optional(),
  location_id: z.string().optional(),
  description: z.string().max(600).optional()
});

eventsRouter.post('/events/personal', h((req, res) => {
  const u = requireUser(req);
  const body = parse(personalSchema, req.body);
  if (body.end_at <= body.start_at) throw bad('End must be after start');
  if (body.location_id && !getLocation(body.location_id)) throw bad('Unknown location');
  const id = newId('evt');
  const row: EventRow = {
    id, club_id: null, kind: 'personal', title_en: body.title, title_ar: body.title, description_en: body.description ?? '',
    start_at: body.start_at, end_at: body.end_at, tz: 'Asia/Riyadh', campus_id: u.campus_id, location_id: body.location_id ?? null, venue_text: body.location_text ?? null,
    capacity: null, organizer: u.name_en, provenance: 'personal', source_url: null, evidence_note: null, deadline: null, eligibility: null, tags: '[]', demo_label: 0, owner_id: u.id, status: 'scheduled', created_at: nowIso()
  };
  db().tx(() => {
    db().insert('events', { ...row });
    upsertEntry(u.id, { source_type: 'personal', source_id: id, title: body.title, kind: 'personal', start_at: body.start_at, end_at: body.end_at, location_id: body.location_id ?? null, location_text: body.location_text ?? (body.location_id ? venueText(row) : null), immovable: false, link: `/campus/events/${id}` });
    audit(u.id, 'event.personal.create', 'event', id, {});
  });
  const conflicts = conflictsFor(u.id, row);
  ok(res, { event: eventView(row, u), conflicts: conflicts.map((c) => ({ entry: c.entry, overlapMinutes: c.overlapMinutes, isClass: c.entry.kind === 'class' })) }, 201);
}));

eventsRouter.delete('/events/:id', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  if (e.kind === 'personal') {
    if (e.owner_id !== u.id) throw forbidden();
    db().tx(() => { removeEntry(u.id, 'personal', e.id); db().run('DELETE FROM events WHERE id = ?', e.id); });
    return ok(res, { deleted: true });
  }
  const club = e.club_id ? getClub(e.club_id) : null;
  if (!club || !isLeadOf(u, club)) throw forbidden('Only the club lead can cancel this event');
  db().tx(() => {
    db().update('events', e.id, { status: 'cancelled' });
    for (const r of db().all("SELECT user_id FROM rsvps WHERE event_id = ? AND status IN ('going','waitlisted')", e.id)) {
      removeEntry(r.user_id as string, 'event', e.id);
      notify(r.user_id as string, { module: 'campus', kind: 'event_cancelled', title: `Cancelled: ${e.title_en}`, body: 'The club lead cancelled this event. It was removed from your calendar.', link: `/campus/clubs/${club.id}` });
    }
    db().run("UPDATE rsvps SET status = 'cancelled', updated_at = ? WHERE event_id = ?", nowIso(), e.id);
    audit(u.id, 'event.cancel', 'event', e.id, {});
  });
  ok(res, { cancelled: true });
}));

// ------------------------------------------------------------------ lead: create / edit club events
const eventSchema = z.object({
  title_en: z.string().min(3).max(160),
  title_ar: z.string().max(160).optional(),
  description_en: z.string().max(2000).optional(),
  start_at: z.string().regex(ISO_RE),
  end_at: z.string().regex(ISO_RE),
  location_id: z.string().nullable().optional(),
  venue_text: z.string().max(160).nullable().optional(),
  capacity: z.number().int().min(1).max(5000).nullable().optional(),
  track: z.string().max(60).optional(),
  tags: z.array(z.string().max(40)).max(10).optional()
});

eventsRouter.post('/clubs/:id/events', h((req, res) => {
  const club = getClub(req.params.id as string);
  const lead = requireLeadOf(req, club);
  const body = parse(eventSchema, req.body);
  if (body.end_at <= body.start_at) throw bad('End must be after start');
  const loc = body.location_id ? getLocation(body.location_id) : null;
  if (body.location_id && !loc) throw bad('Unknown location');
  const tags = [...(body.tags ?? []), ...(body.track ? [`track:${body.track}`] : [])];
  const id = newId('evt');
  const row: EventRow = {
    id, club_id: club.id, kind: 'club', title_en: body.title_en, title_ar: body.title_ar ?? '', description_en: body.description_en ?? '',
    start_at: body.start_at, end_at: body.end_at, tz: 'Asia/Riyadh', campus_id: loc?.campus_id ?? club.campus_id, location_id: loc?.id ?? null, venue_text: body.venue_text ?? null,
    capacity: body.capacity ?? null, organizer: club.name_en, provenance: 'club', source_url: null, evidence_note: null, deadline: null, eligibility: null,
    tags: j(tags), demo_label: 1, owner_id: lead.id, status: 'scheduled', created_at: nowIso()
  };
  db().tx(() => {
    db().insert('events', { ...row });
    // Tell active members about the new event.
    for (const m of db().all("SELECT user_id FROM memberships WHERE club_id = ? AND status = 'active' AND user_id <> ?", club.id, lead.id)) {
      notify(m.user_id as string, { module: 'campus', kind: 'event_new', title: `${club.name_en}: ${body.title_en}`, body: `New event on ${toLocal(body.start_at).date} at ${toLocal(body.start_at).time}. RSVP to add it to your calendar.`, link: `/campus/events/${id}` });
    }
    audit(lead.id, 'event.create', 'event', id, { club_id: club.id });
  });
  ok(res, eventView(row, lead), 201);
}));

eventsRouter.put('/events/:id', h((req, res) => {
  const u = requireUser(req);
  const e = getEvent(req.params.id as string);
  if (e.kind === 'personal') {
    if (e.owner_id !== u.id) throw forbidden();
    const body = parse(personalSchema.partial(), req.body);
    const patch: Record<string, unknown> = {};
    if (body.title) { patch.title_en = body.title; patch.title_ar = body.title; }
    if (body.start_at) patch.start_at = body.start_at;
    if (body.end_at) patch.end_at = body.end_at;
    if (body.location_text !== undefined) patch.venue_text = body.location_text;
    if (body.description !== undefined) patch.description_en = body.description;
    const next = { ...e, ...patch } as EventRow;
    if (next.end_at <= next.start_at) throw bad('End must be after start');
    db().tx(() => {
      db().update('events', e.id, patch);
      upsertEntry(u.id, { source_type: 'personal', source_id: e.id, title: next.title_en, kind: 'personal', start_at: next.start_at, end_at: next.end_at, location_id: next.location_id, location_text: next.venue_text, immovable: false, link: `/campus/events/${e.id}` });
    });
    return ok(res, eventView(next, u));
  }
  const club = e.club_id ? getClub(e.club_id) : null;
  if (!club) throw forbidden('Only club events can be edited');
  requireLeadOf(req, club);
  const body = parse(eventSchema.partial(), req.body);
  const patch: Record<string, unknown> = {};
  for (const k of ['title_en', 'title_ar', 'description_en', 'start_at', 'end_at', 'venue_text', 'capacity'] as const) if (body[k] !== undefined) patch[k] = body[k];
  if (body.location_id !== undefined) {
    const loc = body.location_id ? getLocation(body.location_id) : null;
    if (body.location_id && !loc) throw bad('Unknown location');
    patch.location_id = loc?.id ?? null;
    if (loc) patch.campus_id = loc.campus_id;
  }
  if (body.tags !== undefined || body.track !== undefined) {
    const current = eventTags(e).filter((t) => body.track === undefined || !t.startsWith('track:'));
    const tags = body.tags !== undefined ? [...body.tags, ...(body.track ? [`track:${body.track}`] : current.filter((t) => t.startsWith('track:')))] : [...current, ...(body.track ? [`track:${body.track}`] : [])];
    patch.tags = j([...new Set(tags)]);
  }
  const next = { ...e, ...patch } as EventRow;
  if (next.end_at <= next.start_at) throw bad('End must be after start');
  db().tx(() => {
    db().update('events', e.id, patch);
    const timeChanged = next.start_at !== e.start_at || next.end_at !== e.end_at || next.location_id !== e.location_id || next.title_en !== e.title_en;
    for (const r of db().all("SELECT user_id FROM rsvps WHERE event_id = ? AND status = 'going'", e.id)) {
      upsertEntry(r.user_id as string, { source_type: 'event', source_id: e.id, title: next.title_en, kind: 'event', start_at: next.start_at, end_at: next.end_at, location_id: next.location_id, location_text: venueText(next), immovable: false, link: `/campus/events/${e.id}`, meta: { club_id: e.club_id, event_kind: e.kind } });
      if (timeChanged && r.user_id !== u.id) notify(r.user_id as string, { module: 'campus', kind: 'event_updated', title: `Updated: ${next.title_en}`, body: 'Time or venue changed. Your calendar entry was updated – check for new conflicts.', link: `/campus/events/${e.id}` });
    }
    audit(u.id, 'event.update', 'event', e.id, patch);
  });
  ok(res, eventView(next, u));
}));
