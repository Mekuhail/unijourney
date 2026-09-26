import type { CalendarEntry, CalendarKind } from '../../shared/types.ts';
import { db, j, pj } from './db.ts';
import { newId } from './ids.ts';
import { nowIso, overlaps } from './clock.ts';

export interface CalendarInput {
  source_type: string;
  source_id: string;
  title: string;
  kind: CalendarKind;
  start_at: string;
  end_at: string;
  location_id?: string | null;
  location_text?: string | null;
  immovable?: boolean;
  link?: string | null;
  meta?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): CalendarEntry {
  return { ...r, immovable: !!r.immovable, meta: pj(r.meta, {}) };
}

/** Idempotent: one entry per (owner, source_type, source_id). Re-calling updates in place. */
export function upsertEntry(ownerId: string, e: CalendarInput): CalendarEntry {
  const existing = db().get('SELECT id FROM calendar_entries WHERE owner_id = ? AND source_type = ? AND source_id = ?', ownerId, e.source_type, e.source_id);
  const id = (existing?.id as string) ?? newId('cal');
  db().upsert('calendar_entries', {
    id,
    owner_id: ownerId,
    source_type: e.source_type,
    source_id: e.source_id,
    title: e.title,
    kind: e.kind,
    start_at: e.start_at,
    end_at: e.end_at,
    tz: 'Asia/Riyadh',
    location_id: e.location_id ?? null,
    location_text: e.location_text ?? null,
    immovable: e.immovable ? 1 : 0,
    link: e.link ?? null,
    meta: j(e.meta ?? {}),
    created_at: nowIso()
  });
  return rowToEntry(db().get('SELECT * FROM calendar_entries WHERE id = ?', id));
}

export function removeEntry(ownerId: string, sourceType: string, sourceId: string) {
  db().run('DELETE FROM calendar_entries WHERE owner_id = ? AND source_type = ? AND source_id = ?', ownerId, sourceType, sourceId);
}

export function removeEntriesForSource(sourceType: string, sourceId: string) {
  db().run('DELETE FROM calendar_entries WHERE source_type = ? AND source_id = ?', sourceType, sourceId);
}

export function listEntries(ownerId: string, fromIso?: string, toIso?: string): CalendarEntry[] {
  const rows = fromIso && toIso
    ? db().all('SELECT * FROM calendar_entries WHERE owner_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at', ownerId, toIso, fromIso)
    : db().all('SELECT * FROM calendar_entries WHERE owner_id = ? ORDER BY start_at', ownerId);
  return rows.map(rowToEntry);
}

export interface Conflict {
  entry: CalendarEntry;
  overlapMinutes: number;
}

export function findConflicts(ownerId: string, startIso: string, endIso: string, exclude?: { source_type: string; source_id?: string }): Conflict[] {
  const candidates = listEntries(ownerId, startIso, endIso);
  return candidates
    .filter((c) => !(exclude && c.source_type === exclude.source_type && (!exclude.source_id || c.source_id === exclude.source_id)))
    .filter((c) => overlaps(startIso, endIso, c.start_at, c.end_at))
    .map((entry) => {
      const s = Math.max(new Date(startIso).getTime(), new Date(entry.start_at).getTime());
      const e = Math.min(new Date(endIso).getTime(), new Date(entry.end_at).getTime());
      return { entry, overlapMinutes: Math.max(0, Math.round((e - s) / 60000)) };
    });
}
