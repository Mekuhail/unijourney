import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb } from './helpers.ts';
import { upsertEntry, findConflicts, listEntries, removeEntry } from '../server/core/calendar.ts';
import { db } from '../server/core/db.ts';
import { addDays, toLocal, localToIso, weekdayOf } from '../server/core/clock.ts';

describe('shared calendar', () => {
  beforeEach(() => freshDb());

  it('upsert is idempotent per (owner, source_type, source_id)', () => {
    const e1 = upsertEntry('u_student', { source_type: 'event', source_id: 'ev1', title: 'Workshop', kind: 'event', start_at: '2026-09-29T13:00:00.000Z', end_at: '2026-09-29T15:00:00.000Z' });
    const e2 = upsertEntry('u_student', { source_type: 'event', source_id: 'ev1', title: 'Workshop (updated)', kind: 'event', start_at: '2026-09-29T13:00:00.000Z', end_at: '2026-09-29T15:00:00.000Z' });
    expect(e1.id).toBe(e2.id);
    expect(db().count('calendar_entries', "owner_id = 'u_student' AND source_type = 'event' AND source_id = 'ev1'")).toBe(1);
    removeEntry('u_student', 'event', 'ev1');
    expect(listEntries('u_student').filter((e) => e.source_type === 'event' && e.source_id === 'ev1')).toHaveLength(0);
  });

  it('detects overlapping entries and excludes the source being checked', () => {
    upsertEntry('u_student', { source_type: 'section', source_id: 's1', title: 'CIS 321', kind: 'class', start_at: '2026-10-01T08:00:00.000Z', end_at: '2026-10-01T09:15:00.000Z', immovable: true });
    const c = findConflicts('u_student', '2026-10-01T08:30:00.000Z', '2026-10-01T10:00:00.000Z');
    expect(c).toHaveLength(1);
    expect(c[0].overlapMinutes).toBe(45);
    expect(findConflicts('u_student', '2026-10-01T08:30:00.000Z', '2026-10-01T10:00:00.000Z', { source_type: 'section' })).toHaveLength(0);
    expect(findConflicts('u_lead', '2026-10-01T08:30:00.000Z', '2026-10-01T10:00:00.000Z')).toHaveLength(0);
  });

  it('clock helpers use Asia/Riyadh (+03:00) with a Sunday-based week', () => {
    expect(toLocal('2026-09-27T06:00:00.000Z')).toMatchObject({ date: '2026-09-27', time: '09:00', weekday: 0 });
    expect(localToIso('2026-09-27', '09:00')).toBe('2026-09-27T09:00:00+03:00');
    expect(addDays('2026-09-30', 2)).toBe('2026-10-02');
    expect(weekdayOf('2026-10-01')).toBe(4); // Thursday
  });
});
