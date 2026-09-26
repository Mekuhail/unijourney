import type { Request } from 'express';
import type { User } from '../../../shared/types.ts';
import { db, pj } from '../../core/db.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { forbidden, notFound } from '../../core/http.ts';
import { localToIso, now, toLocal } from '../../core/clock.ts';

export interface LocationRow {
  id: string;
  campus_id: string;
  kind: string;
  name_en: string;
  name_ar: string;
  building_id: string | null;
  floor: number;
  lat: number;
  lng: number;
  accessible: 'yes' | 'no' | 'unknown';
  tags: string;
  description_en: string;
  geometry_status: string;
  searchable: number;
}

export interface ClubRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category: string;
  lead_id: string | null;
  color: string;
  campus_id: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  club_id: string | null;
  kind: 'club' | 'external' | 'personal' | 'university';
  title_en: string;
  title_ar: string;
  description_en: string;
  start_at: string;
  end_at: string;
  tz: string;
  campus_id: string | null;
  location_id: string | null;
  venue_text: string | null;
  capacity: number | null;
  organizer: string;
  provenance: string;
  source_url: string | null;
  evidence_note: string | null;
  deadline: string | null;
  eligibility: string | null;
  tags: string;
  demo_label: number;
  owner_id: string | null;
  status: string;
  created_at: string;
}

export function getLocation(id: string | null | undefined): LocationRow | null {
  if (!id) return null;
  return db().get<LocationRow>('SELECT * FROM campus_locations WHERE id = ?', id) ?? null;
}

export function locationSummary(id: string | null | undefined) {
  const l = getLocation(id);
  if (!l) return null;
  const building = l.building_id ? getLocation(l.building_id) : null;
  return {
    id: l.id,
    campus_id: l.campus_id,
    kind: l.kind,
    name_en: l.name_en,
    name_ar: l.name_ar,
    building_id: l.building_id,
    building_name_en: building?.name_en ?? null,
    building_name_ar: building?.name_ar ?? null,
    floor: l.floor,
    lat: l.lat,
    lng: l.lng,
    accessible: l.accessible,
    geometry_status: l.geometry_status
  };
}

export function locationName(id: string | null | undefined, fallback = ''): string {
  return getLocation(id)?.name_en ?? fallback;
}

export function userBrief(id: string | null | undefined) {
  if (!id) return null;
  const u = db().get('SELECT id, name_en, name_ar, avatar_color, student_no, program_id, campus_id, email FROM users WHERE id = ?', id);
  return u ? { id: u.id as string, name_en: u.name_en as string, name_ar: u.name_ar as string, avatar_color: u.avatar_color as string, student_no: (u.student_no as string | null) ?? null, program_id: (u.program_id as string | null) ?? null, campus_id: u.campus_id as string } : null;
}

export function userEmail(id: string): string {
  return (db().get<{ email: string }>('SELECT email FROM users WHERE id = ?', id)?.email as string) ?? '';
}

export function getClub(id: string): ClubRow {
  const c = db().get<ClubRow>('SELECT * FROM clubs WHERE id = ? OR slug = ?', id, id);
  if (!c) throw notFound('Club not found');
  return c;
}

export function getEvent(id: string): EventRow {
  const e = db().get<EventRow>('SELECT * FROM events WHERE id = ?', id);
  if (!e) throw notFound('Event not found');
  return e;
}

/** True when the user holds the club_lead role AND is the lead of this specific club. */
export function isLeadOf(user: User, club: ClubRow): boolean {
  return hasRole(user, 'club_lead') && club.lead_id === user.id;
}

export function requireLeadOf(req: Request, club: ClubRow): User {
  const u = requireUser(req);
  if (!isLeadOf(u, club)) throw forbidden('Only the lead of this club can do that');
  return u;
}

export function eventTags(e: EventRow): string[] {
  return pj<string[]>(e.tags, []);
}

/** "Now" rendered in the same `YYYY-MM-DDTHH:mm:00+03:00` shape as seeded timestamps, so SQL/string comparisons are consistent. */
export function nowLocalIso(): string {
  const p = toLocal(now());
  return localToIso(p.date, p.time);
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < now().getTime();
}

export function localDate(iso: string): string {
  return toLocal(iso).date;
}

export function localTime(iso: string): string {
  return toLocal(iso).time;
}

export interface TimelineItem { at: string; status: string; by: string | null; note?: string; email_id?: string; [k: string]: unknown }

export function pushTimeline(current: string, item: TimelineItem): string {
  const list = pj<TimelineItem[]>(current, []);
  list.push(item);
  return JSON.stringify(list);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
