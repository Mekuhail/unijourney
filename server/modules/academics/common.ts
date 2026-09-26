import { db, pj } from '../../core/db.ts';
import { addDays, minutesOf, weekdayOf } from '../../core/clock.ts';
import { CURRENT_TERM, NEXT_TERM, TERM_LABELS } from '../../core/settings.ts';
import { COURSE_BY_CODE, prereqRule } from './curriculum.ts';

export interface Meeting { day: number; start: string; end: string; location_id: string | null }
export interface LocationInfo { id: string; name_en: string; name_ar: string; building_id: string | null; building_en: string | null; building_ar: string | null; campus_id: string }
export interface SectionView {
  id: string;
  course_code: string;
  title_en: string;
  title_ar: string;
  credits: number;
  term: string;
  section_no: string;
  instructor: string;
  campus_id: string;
  capacity: number;
  enrolled: number;
  seats_left: number;
  status: string;
  meetings: Array<Meeting & { location: LocationInfo | null }>;
}

export const TERM_DATES: Record<string, { start: string; end: string }> = {
  '2026-1': { start: '2026-08-23', end: '2026-12-10' },
  '2026-2': { start: '2027-01-17', end: '2027-05-06' }
};

export function termLabel(term: string): { en: string; ar: string } {
  const known = TERM_LABELS[term];
  if (known) return known;
  const [y, s] = term.split('-').map(Number);
  if (s === 1) return { en: `Fall ${y}`, ar: `الفصل الأول ${y}` };
  if (s === 2) return { en: `Spring ${y + 1}`, ar: `الفصل الثاني ${y + 1}` };
  return { en: `Summer ${y + 1}`, ar: `الفصل الصيفي ${y + 1}` };
}

export { CURRENT_TERM, NEXT_TERM };

// ---------------------------------------------------------------- locations
let locCache: Map<string, LocationInfo> | null = null;
let locCacheStamp = 0;
export function locationMap(): Map<string, LocationInfo> {
  const stamp = db().count('campus_locations');
  if (locCache && locCacheStamp === stamp) return locCache;
  const rows = db().all('SELECT id, name_en, name_ar, building_id, campus_id FROM campus_locations');
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  locCache = new Map();
  for (const r of rows) {
    const b = r.building_id ? byId.get(r.building_id as string) : null;
    locCache.set(r.id as string, { id: r.id as string, name_en: r.name_en as string, name_ar: r.name_ar as string, building_id: (r.building_id as string | null) ?? null, building_en: (b?.name_en as string | null) ?? null, building_ar: (b?.name_ar as string | null) ?? null, campus_id: r.campus_id as string });
  }
  locCacheStamp = stamp;
  return locCache;
}
export function locationInfo(id: string | null | undefined): LocationInfo | null {
  if (!id) return null;
  return locationMap().get(id) ?? null;
}
export function buildingOf(locationId: string | null | undefined): string | null {
  const l = locationInfo(locationId);
  if (!l) return null;
  return l.building_id ?? l.id;
}

/** Shortest walking distance (m) between two locations over path_edges (rooms are linked to their buildings). */
const distCache = new Map<string, number | null>();
export function pathDistance(fromId: string, toId: string): number | null {
  if (fromId === toId) return 0;
  const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
  if (distCache.has(key)) return distCache.get(key)!;
  const edges = db().all<{ from_id: string; to_id: string; meters: number; bidirectional: number }>('SELECT from_id, to_id, meters, bidirectional FROM path_edges');
  const adj = new Map<string, Array<{ to: string; m: number }>>();
  const add = (a: string, b: string, m: number) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ to: b, m }); };
  for (const e of edges) { add(e.from_id, e.to_id, e.meters); if (e.bidirectional) add(e.to_id, e.from_id, e.meters); }
  const dist = new Map<string, number>([[fromId, 0]]);
  const done = new Set<string>();
  while (true) {
    let cur: string | null = null, best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; cur = n; }
    if (cur === null) break;
    if (cur === toId) break;
    done.add(cur);
    for (const { to, m } of adj.get(cur) ?? []) {
      const nd = best + m;
      if (nd < (dist.get(to) ?? Infinity)) dist.set(to, nd);
    }
  }
  const r = dist.has(toId) ? Math.round(dist.get(toId)!) : null;
  distCache.set(key, r);
  return r;
}
export function resetCaches() { locCache = null; distCache.clear(); }

// ---------------------------------------------------------------- sections
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sectionView(r: any): SectionView {
  const course = COURSE_BY_CODE.get(r.course_code as string);
  const dbCourse = course ? null : db().get('SELECT title_en, title_ar, credits FROM courses WHERE code = ?', r.course_code);
  const meetings = pj<Meeting[]>(r.meetings, []).map((m) => ({ ...m, location: locationInfo(m.location_id) }));
  return {
    id: r.id, course_code: r.course_code, title_en: course?.title_en ?? (dbCourse?.title_en as string) ?? r.course_code, title_ar: course?.title_ar ?? (dbCourse?.title_ar as string) ?? '',
    credits: course?.credits ?? (dbCourse?.credits as number) ?? 0, term: r.term, section_no: r.section_no, instructor: r.instructor, campus_id: r.campus_id,
    capacity: r.capacity, enrolled: r.enrolled, seats_left: Math.max(0, (r.capacity as number) - (r.enrolled as number)), status: r.status, meetings
  };
}
export function getSection(id: string): SectionView | null {
  const r = db().get('SELECT * FROM course_sections WHERE id = ?', id);
  return r ? sectionView(r) : null;
}
export function listSections(term: string, opts: { course?: string; campus?: string } = {}): SectionView[] {
  const where = ['term = ?'];
  const params: unknown[] = [term];
  if (opts.course) { where.push('course_code = ?'); params.push(opts.course); }
  if (opts.campus) { where.push('campus_id = ?'); params.push(opts.campus); }
  return db().all(`SELECT * FROM course_sections WHERE ${where.join(' AND ')} ORDER BY course_code, section_no`, ...params).map(sectionView);
}

export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  return a.day === b.day && minutesOf(a.start) < minutesOf(b.end) && minutesOf(b.start) < minutesOf(a.end);
}
export function sectionsOverlap(a: SectionView, b: SectionView): Array<{ a: Meeting; b: Meeting }> {
  const out: Array<{ a: Meeting; b: Meeting }> = [];
  for (const ma of a.meetings) for (const mb of b.meetings) if (meetingsOverlap(ma, mb)) out.push({ a: ma, b: mb });
  return out;
}

/** All dated occurrences of a section's meetings within the term. */
export function meetingOccurrences(section: { meetings: Meeting[] }, term: string, until?: string): Array<Meeting & { date: string }> {
  const range = TERM_DATES[term];
  if (!range) return [];
  const out: Array<Meeting & { date: string }> = [];
  const end = until && until < range.end ? until : range.end;
  for (let d = range.start; d <= end; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const m of section.meetings) if (m.day === wd) out.push({ ...m, date: d });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

// ---------------------------------------------------------------- student context
export interface TranscriptRow { id: string; student_id: string; course_code: string; term: string; status: string; grade: string | null; credits: number; section_id: string | null; evidence: string | null }
export interface StudentContext {
  userId: string;
  programId: string | null;
  campusId: string;
  level: number;
  name_en: string;
  transcript: TranscriptRow[];
  completed: Set<string>;    // completed + equivalent
  enrolled: Set<string>;     // currently enrolled (any term with status enrolled)
  enrolledTerms: Map<string, string>;
  earnedCredits: number;
  inProgressCredits: number;
}
export function studentContext(userId: string): StudentContext {
  const u = db().get('SELECT id, program_id, campus_id, level, name_en FROM users WHERE id = ?', userId);
  const transcript = db().all<TranscriptRow>('SELECT * FROM transcript_entries WHERE student_id = ? ORDER BY term, course_code', userId);
  const completed = new Set<string>();
  const enrolled = new Set<string>();
  const enrolledTerms = new Map<string, string>();
  let earned = 0, inProgress = 0;
  for (const t of transcript) {
    if (t.status === 'completed' || t.status === 'equivalent') { if (!completed.has(t.course_code)) earned += t.credits; completed.add(t.course_code); }
    else if (t.status === 'enrolled') { enrolled.add(t.course_code); enrolledTerms.set(t.course_code, t.term); inProgress += t.credits; }
  }
  return { userId, programId: (u?.program_id as string | null) ?? null, campusId: (u?.campus_id as string) ?? 'riyadh', level: (u?.level as number) ?? 1, name_en: (u?.name_en as string) ?? '', transcript, completed, enrolled, enrolledTerms, earnedCredits: earned, inProgressCredits: inProgress };
}

export interface PrereqEvaluation { met: boolean; missing: string[][]; inProgress: string[][]; creditShort: number }
/** Evaluates a prerequisite rule against completed (and optionally in-progress) courses. */
export function evaluatePrereqs(code: string, ctx: StudentContext, opts: { countInProgress?: boolean } = {}): PrereqEvaluation {
  const rule = prereqRule(code, ctx.programId);
  const missing: string[][] = [];
  const inProgress: string[][] = [];
  for (const group of rule.prereqs) {
    if (group.some((c) => ctx.completed.has(c))) continue;
    if (group.some((c) => ctx.enrolled.has(c))) { inProgress.push(group); if (!opts.countInProgress) missing.push(group); continue; }
    missing.push(group);
  }
  const creditShort = Math.max(0, rule.min_credits - ctx.earnedCredits);
  return { met: missing.length === 0 && creditShort === 0, missing, inProgress, creditShort };
}

export function enrolledSectionsFor(userId: string, term: string): SectionView[] {
  const rows = db().all(`SELECT s.* FROM transcript_entries t JOIN course_sections s ON s.id = t.section_id WHERE t.student_id = ? AND t.term = ? AND t.status = 'enrolled' ORDER BY s.course_code`, userId, term);
  return rows.map(sectionView);
}

export function courseTitle(code: string): { en: string; ar: string; credits: number } {
  const c = COURSE_BY_CODE.get(code);
  if (c) return { en: c.title_en, ar: c.title_ar, credits: c.credits };
  const r = db().get('SELECT title_en, title_ar, credits FROM courses WHERE code = ?', code);
  return { en: (r?.title_en as string) ?? code, ar: (r?.title_ar as string) ?? '', credits: (r?.credits as number) ?? 0 };
}

export function fmtMeeting(m: Meeting): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[m.day]} ${m.start}–${m.end}`;
}
