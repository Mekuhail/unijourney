import { minutesOf } from '../../core/clock.ts';
import { getPolicies } from '../../core/settings.ts';
import { COURSE_BY_CODE, PLANS, REQUIREMENTS, prereqRule, programCourseCodes } from './curriculum.ts';
import { buildingOf, evaluatePrereqs, listSections, locationInfo, pathDistance, sectionsOverlap, type Meeting, type SectionView, type StudentContext } from './common.ts';
import { DAY_LABEL } from './nl.ts';

export interface KeepWindow { day: number; start: string; end: string; label?: string }
export interface Preferences {
  text?: string; avoidEarly?: boolean; avoidDays?: number[]; keepWindows?: KeepWindow[]; maxCredits?: number; pinned?: string[]; courses?: string[];
  countInProgress?: boolean; compact?: boolean; lightLoad?: boolean;
}
export type CheckStatus = 'pass' | 'fail' | 'warn';
export interface Check { id: string; label: string; status: CheckStatus; hard: boolean; explanation: string; details?: unknown }
export interface EligibleCourse {
  code: string; title_en: string; title_ar: string; credits: number; category: string; required: boolean; eligible: boolean; reasons: string[];
  missing: string[][]; in_progress: string[][]; credit_short: number; priority: number; sections: SectionView[]; conditional: boolean;
}
export interface TravelGap { day: number; from: string; to: string; from_building: string | null; to_building: string | null; gap_min: number; walk_min: number; distance_m: number | null; required_min: number; status: CheckStatus }
export interface OptionCourse { code: string; title_en: string; title_ar: string; credits: number; section_id: string; section_no: string; instructor: string; meetings: SectionView['meetings']; seats_left: number }
export interface PlanOption { id: string; label_en: string; label_ar: string; section_ids: string[]; credits: number; courses: OptionCourse[]; checks: Check[]; score: number; tradeoffs: string[]; travel: TravelGap[]; days: number[]; feasible: boolean }

const WALK_M_PER_MIN = 75;
const MAX_LEAVES = 4000;

export function walkMinutes(fromLoc: string | null, toLoc: string | null): { walk: number; distance: number | null } {
  if (!fromLoc || !toLoc) return { walk: 0, distance: null };
  const bf = buildingOf(fromLoc), bt = buildingOf(toLoc);
  if (bf && bt && bf === bt) return { walk: 2, distance: 0 };
  const d = pathDistance(bf ?? fromLoc, bt ?? toLoc);
  if (d === null) return { walk: 8, distance: null };
  // walking time plus a fixed allowance for leaving one building and finding the room in the next
  return { walk: Math.max(2, Math.ceil(d / WALK_M_PER_MIN) + 2), distance: d };
}

// ---------------------------------------------------------------- eligibility
export function analyzeEligibility(ctx: StudentContext, term: string, prefs: Preferences): EligibleCourse[] {
  const programId = ctx.programId ?? 'bse';
  const plan = PLANS[programId] ?? PLANS.bse;
  const reqs = REQUIREMENTS[programId] ?? REQUIREMENTS.bse;
  const electivePools = reqs.filter((r) => (r.min_courses ?? 0) > 0);
  const electiveNeed = new Map<string, number>();
  for (const pool of electivePools) {
    const done = pool.course_codes.filter((c) => ctx.completed.has(c) || ctx.enrolled.has(c)).length;
    electiveNeed.set(pool.id, Math.max(0, (pool.min_courses ?? 0) - done));
  }
  const slotIndex = new Map<string, number>();
  plan.forEach((t, i) => t.slots.forEach((s) => { if (typeof s === 'string') slotIndex.set(s, i); }));
  const sections = listSections(term, { campus: ctx.campusId }).filter((s) => s.status === 'open');
  const byCourse = new Map<string, SectionView[]>();
  for (const s of sections) { if (!byCourse.has(s.course_code)) byCourse.set(s.course_code, []); byCourse.get(s.course_code)!.push(s); }
  const out: EligibleCourse[] = [];
  for (const code of programCourseCodes(programId)) {
    const c = COURSE_BY_CODE.get(code);
    if (!c) continue;
    if (ctx.completed.has(code) || ctx.enrolled.has(code)) continue;
    if (c.credits === 0 && !(prefs.courses ?? []).includes(code)) continue;
    const ev = evaluatePrereqs(code, ctx, { countInProgress: !!prefs.countInProgress });
    const reasons: string[] = [];
    for (const g of ev.missing) {
      const inProg = g.some((x) => ctx.enrolled.has(x));
      reasons.push(inProg ? `${g.join(' or ')} is in progress this term (not yet completed)` : `Prerequisite ${g.join(' or ')} not completed`);
    }
    if (ev.creditShort > 0) reasons.push(`Requires ${prereqRule(code, ctx.programId).min_credits} earned credits (you have ${ctx.earnedCredits})`);
    const secs = byCourse.get(code) ?? [];
    if (!secs.length) reasons.push(`No sections offered in ${term} at the ${ctx.campusId} campus`);
    const pool = electivePools.find((p) => p.course_codes.includes(code));
    const required = !pool;
    let priority: number;
    if (required) priority = slotIndex.get(code) ?? 50;
    else priority = 100 + ((electiveNeed.get(pool!.id) ?? 0) > 0 ? 0 : 50) + (slotIndex.get(code) ?? 0);
    if ((prefs.courses ?? []).includes(code)) priority -= 1000;
    const conditional = ev.inProgress.length > 0 && !!prefs.countInProgress && ev.missing.length === 0;
    out.push({ code, title_en: c.title_en, title_ar: c.title_ar, credits: c.credits, category: c.category, required, eligible: reasons.length === 0, reasons, missing: ev.missing, in_progress: ev.inProgress, credit_short: ev.creditShort, priority, sections: secs, conditional });
  }
  return out.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
}

// ---------------------------------------------------------------- checks
function early(m: Meeting) { return minutesOf(m.start) < 9 * 60; }
function overlapsWindow(m: Meeting, w: KeepWindow) { return m.day === w.day && minutesOf(m.start) < minutesOf(w.end) && minutesOf(w.start) < minutesOf(m.end); }

export function travelGaps(sections: SectionView[]): TravelGap[] {
  const gapPolicy = getPolicies().travelGapMinutes.value;
  const out: TravelGap[] = [];
  for (let day = 0; day < 7; day++) {
    const ms = sections.flatMap((s) => s.meetings.filter((m) => m.day === day).map((m) => ({ m, s }))).sort((a, b) => minutesOf(a.m.start) - minutesOf(b.m.start));
    for (let i = 1; i < ms.length; i++) {
      const a = ms[i - 1], b = ms[i];
      const bf = buildingOf(a.m.location_id), bt = buildingOf(b.m.location_id);
      if (!bf || !bt || bf === bt) continue;
      const gap = minutesOf(b.m.start) - minutesOf(a.m.end);
      const { walk, distance } = walkMinutes(a.m.location_id, b.m.location_id);
      const required = gapPolicy + walk;
      const status: CheckStatus = gap < gapPolicy ? 'fail' : gap < required ? 'warn' : 'pass';
      out.push({ day, from: a.s.course_code, to: b.s.course_code, from_building: locationInfo(bf)?.name_en ?? bf, to_building: locationInfo(bt)?.name_en ?? bt, gap_min: gap, walk_min: walk, distance_m: distance, required_min: required, status });
    }
  }
  return out;
}

export function checkBasket(ctx: StudentContext, sections: SectionView[], prefs: Preferences, elig: EligibleCourse[], term: string, opts: { currentTerm: string }): { checks: Check[]; travel: TravelGap[]; credits: number } {
  const pol = getPolicies();
  const checks: Check[] = [];
  const credits = sections.reduce((s, x) => s + x.credits, 0);
  const eligByCode = new Map(elig.map((e) => [e.code, e]));
  // registration window
  checks.push(term === opts.currentTerm
    ? { id: 'term', label: 'Registration window', status: 'fail', hard: true, explanation: `Registration for the current term (${term}) is closed; plan the next term instead.` }
    : { id: 'term', label: 'Registration window', status: 'pass', hard: true, explanation: `Registration for ${term} is open (demo).` });
  // prerequisites
  const prereqFails: string[] = [], prereqWarns: string[] = [];
  for (const s of sections) {
    const ev = evaluatePrereqs(s.course_code, ctx, { countInProgress: !!prefs.countInProgress });
    if (!ev.met) prereqFails.push(`${s.course_code}: ${ev.missing.map((g) => g.join(' or ')).join(', ')}${ev.creditShort ? ` (needs ${ev.creditShort} more earned credits)` : ''}`);
    else if (ev.inProgress.length) prereqWarns.push(`${s.course_code}: ${ev.inProgress.map((g) => g.join(' or ')).join(', ')} in progress — conditional on passing`);
  }
  checks.push({ id: 'prereqs', label: 'Prerequisites', status: prereqFails.length ? 'fail' : prereqWarns.length ? 'warn' : 'pass', hard: true, explanation: prereqFails.length ? `Unmet: ${prereqFails.join('; ')}` : prereqWarns.length ? prereqWarns.join('; ') : 'All prerequisites are completed or approved as equivalent.', details: { fails: prereqFails, warns: prereqWarns } });
  // co-requisites
  const coreqFails: string[] = [];
  const basketCodes = new Set(sections.map((s) => s.course_code));
  for (const s of sections) for (const g of prereqRule(s.course_code, ctx.programId).coreqs) if (!g.some((c) => basketCodes.has(c) || ctx.completed.has(c))) coreqFails.push(`${s.course_code} requires ${g.join(' or ')} in the same term`);
  checks.push({ id: 'coreqs', label: 'Co-requisites', status: coreqFails.length ? 'fail' : 'pass', hard: true, explanation: coreqFails.length ? coreqFails.join('; ') : 'No co-requisite rule is violated.' });
  // duplicates / already completed
  const dup: string[] = [];
  const seen = new Set<string>();
  for (const s of sections) { if (seen.has(s.course_code)) dup.push(`${s.course_code} appears twice`); seen.add(s.course_code); if (ctx.completed.has(s.course_code)) dup.push(`${s.course_code} is already completed`); if (ctx.enrolled.has(s.course_code)) dup.push(`${s.course_code} is already enrolled`); }
  checks.push({ id: 'duplicates', label: 'Duplicate enrolment', status: dup.length ? 'fail' : 'pass', hard: true, explanation: dup.length ? dup.join('; ') : 'No course is repeated or already on your transcript.' });
  // time overlap
  const overlaps: string[] = [];
  for (let i = 0; i < sections.length; i++) for (let k = i + 1; k < sections.length; k++) {
    const o = sectionsOverlap(sections[i], sections[k]);
    if (o.length) overlaps.push(`${sections[i].course_code} sec ${sections[i].section_no} and ${sections[k].course_code} sec ${sections[k].section_no} overlap on ${DAY_LABEL[o[0].a.day]} ${o[0].a.start}–${o[0].a.end}`);
  }
  checks.push({ id: 'overlap', label: 'Time conflicts', status: overlaps.length ? 'fail' : 'pass', hard: true, explanation: overlaps.length ? overlaps.join('; ') : 'No two sections meet at the same time.', details: overlaps });
  // capacity
  const full = sections.filter((s) => s.seats_left <= 0).map((s) => `${s.course_code} sec ${s.section_no} is full (${s.enrolled}/${s.capacity})`);
  const tight = sections.filter((s) => s.seats_left > 0 && s.seats_left <= 2).map((s) => `${s.course_code} sec ${s.section_no}: only ${s.seats_left} seat${s.seats_left === 1 ? '' : 's'} left`);
  checks.push({ id: 'capacity', label: 'Seat availability', status: full.length ? 'fail' : tight.length ? 'warn' : 'pass', hard: true, explanation: full.length ? full.join('; ') : tight.length ? `${tight.join('; ')} — seats are re-checked at submission.` : 'Every selected section has seats (re-checked live at submission).', details: { full, tight } });
  // credits
  const limit = Math.min(pol.creditLimit.value, prefs.maxCredits ?? pol.creditLimit.value);
  checks.push({ id: 'credit_limit', label: 'Credit limit', status: credits > limit ? 'fail' : 'pass', hard: true, explanation: credits > limit ? `${credits} credits exceed the limit of ${limit} (${prefs.maxCredits && prefs.maxCredits < pol.creditLimit.value ? 'your preference' : pol.creditLimit.provenance}).` : `${credits} of ${limit} credits (${pol.creditLimit.label_en}: ${pol.creditLimit.value}).` });
  checks.push({ id: 'credit_min', label: 'Full-time minimum', status: credits < pol.creditMinimum.value ? 'warn' : 'pass', hard: false, explanation: credits < pol.creditMinimum.value ? `${credits} credits is below the full-time minimum of ${pol.creditMinimum.value} (${pol.creditMinimum.provenance}).` : `Meets the full-time minimum of ${pol.creditMinimum.value} credits.` });
  // travel gaps
  const travel = travelGaps(sections);
  const tFail = travel.filter((t) => t.status === 'fail'), tWarn = travel.filter((t) => t.status === 'warn');
  const tf = (t: TravelGap) => `${DAY_LABEL[t.day]}: ${t.from} → ${t.to} (${t.from_building} → ${t.to_building}) has ${t.gap_min} min, ~${t.walk_min} min walk${t.distance_m !== null ? ` (${t.distance_m} m)` : ''}`;
  checks.push({ id: 'travel', label: 'Travel gaps between buildings', status: tFail.length ? 'fail' : tWarn.length ? 'warn' : 'pass', hard: true, explanation: tFail.length ? `${tFail.map(tf).join('; ')} — below the ${pol.travelGapMinutes.value}-minute minimum.` : tWarn.length ? `${tWarn.map(tf).join('; ')} — tight but above the ${pol.travelGapMinutes.value}-minute policy minimum.` : sections.length ? 'Consecutive classes leave enough time to walk between buildings.' : 'No consecutive classes.', details: travel });
  // campus / program
  const offCampus = sections.filter((s) => s.campus_id !== ctx.campusId).map((s) => `${s.course_code} sec ${s.section_no} is on the ${s.campus_id} campus`);
  const offProgram = sections.filter((s) => !eligByCode.has(s.course_code) && !ctx.completed.has(s.course_code)).map((s) => `${s.course_code} is not part of your program plan`);
  checks.push({ id: 'campus', label: 'Campus & program', status: offCampus.length ? 'fail' : offProgram.length ? 'warn' : 'pass', hard: true, explanation: offCampus.length ? offCampus.join('; ') : offProgram.length ? offProgram.join('; ') : `All sections are on your campus (${ctx.campusId}) and in your program plan.` });
  // soft preferences
  const prefIssues: string[] = [];
  if (prefs.avoidEarly) for (const s of sections) for (const m of s.meetings) if (early(m)) prefIssues.push(`${s.course_code} meets ${DAY_LABEL[m.day]} ${m.start} (early)`);
  if (prefs.avoidDays?.length) for (const s of sections) for (const m of s.meetings) if (prefs.avoidDays.includes(m.day)) prefIssues.push(`${s.course_code} meets on ${DAY_LABEL[m.day]}`);
  if (prefs.keepWindows?.length) for (const s of sections) for (const m of s.meetings) for (const w of prefs.keepWindows) if (overlapsWindow(m, w)) prefIssues.push(`${s.course_code} overlaps your protected window ${DAY_LABEL[w.day]} ${w.start}–${w.end}`);
  checks.push({ id: 'preferences', label: 'Your preferences', status: prefIssues.length ? 'warn' : 'pass', hard: false, explanation: prefIssues.length ? [...new Set(prefIssues)].join('; ') : 'All stated preferences are satisfied.', details: [...new Set(prefIssues)] });
  return { checks, travel, credits };
}

export function hardFails(checks: Check[]): Check[] { return checks.filter((c) => c.hard && c.status === 'fail'); }

// ---------------------------------------------------------------- option generation
interface Basket { sections: SectionView[]; credits: number }

function scoreBasket(b: Basket, prefs: Preferences, elig: Map<string, EligibleCourse>, travel: TravelGap[], pol: ReturnType<typeof getPolicies>): number {
  let score = 0;
  for (const s of b.sections) {
    const e = elig.get(s.course_code);
    const w = e?.required ? 4 : (e && e.priority < 150 ? 2 : 0.5);
    score += s.credits * w;
    if (prefs.courses?.includes(s.course_code)) score += 6;
    if (prefs.pinned?.includes(s.id)) score += 8;
    if (e?.conditional) score -= 1.5;
    for (const m of s.meetings) {
      if (prefs.avoidEarly && early(m)) score -= 4;
      if (prefs.avoidDays?.includes(m.day)) score -= 6;
      for (const w2 of prefs.keepWindows ?? []) if (overlapsWindow(m, w2)) score -= 10;
    }
    if (s.seats_left <= 2) score -= 1;
  }
  const days = new Set(b.sections.flatMap((s) => s.meetings.map((m) => m.day)));
  score -= days.size * (prefs.compact ? 2.5 : 0.5);
  score -= travel.filter((t) => t.status === 'warn').length * 2;
  if (b.credits < pol.creditMinimum.value) score -= 5;
  if (prefs.lightLoad) score -= Math.max(0, b.credits - 13) * 2;
  return score;
}

export interface GenerationResult { options: PlanOption[]; notes: string[]; explored: number; eligible: EligibleCourse[] }

export function generateOptions(ctx: StudentContext, term: string, prefs: Preferences, opts: { currentTerm: string }): GenerationResult {
  const pol = getPolicies();
  const elig = analyzeEligibility(ctx, term, prefs);
  const eligMap = new Map(elig.map((e) => [e.code, e]));
  const notes: string[] = [];
  const limit = Math.min(pol.creditLimit.value, prefs.maxCredits ?? pol.creditLimit.value, prefs.lightLoad ? 13 : 99);
  // candidate courses: eligible with seats; electives limited to what is still needed (+1 spare for variety)
  const programId = ctx.programId ?? 'bse';
  const pools = (REQUIREMENTS[programId] ?? REQUIREMENTS.bse).filter((r) => (r.min_courses ?? 0) > 0);
  const electiveQuota = new Map<string, number>();
  for (const p of pools) electiveQuota.set(p.id, Math.max(0, (p.min_courses ?? 0) - p.course_codes.filter((c) => ctx.completed.has(c) || ctx.enrolled.has(c)).length));
  const poolOf = (code: string) => pools.find((p) => p.course_codes.includes(code))?.id ?? null;
  const pinnedSet = new Set(prefs.pinned ?? []);
  const candidates = elig.filter((e) => e.eligible).map((e) => ({
    e,
    sections: e.sections.filter((s) => s.seats_left > 0 && (pinnedSet.size === 0 || !e.sections.some((x) => pinnedSet.has(x.id)) || pinnedSet.has(s.id)))
      .filter((s) => !(prefs.keepWindows ?? []).some((w) => s.meetings.some((m) => overlapsWindow(m, w))))
      .filter((s) => !(prefs.avoidDays ?? []).some((d) => s.meetings.some((m) => m.day === d)) || pinnedSet.has(s.id))
  }));
  for (const c of candidates) {
    const fullOnly = c.e.sections.length && c.e.sections.every((s) => s.seats_left <= 0);
    if (fullOnly) notes.push(`${c.e.code}: every section is full — added to the waitlist suggestion.`);
    else if (!c.sections.length && c.e.sections.length) notes.push(`${c.e.code}: all open sections clash with your protected windows or avoided days.`);
  }
  for (const e of elig.filter((x) => !x.eligible && x.required && x.priority < 40)) notes.push(`${e.code} is not eligible yet: ${e.reasons.join('; ')}`);
  const active = candidates.filter((c) => c.sections.length).slice(0, 14);
  const baskets: Basket[] = [];
  let leaves = 0;
  const chosen: SectionView[] = [];
  const quota = new Map(electiveQuota);
  const dfs = (i: number, credits: number) => {
    if (leaves >= MAX_LEAVES) return;
    if (i === active.length) { leaves++; if (chosen.length) baskets.push({ sections: [...chosen], credits }); return; }
    const c = active[i];
    const pool = poolOf(c.e.code);
    const canElective = !pool || (quota.get(pool) ?? 0) > 0;
    const order: Array<SectionView | null> = c.e.required || canElective ? [...c.sections, null] : [null, ...c.sections];
    for (const s of order) {
      if (s === null) { dfs(i + 1, credits); continue; }
      if (credits + s.credits > limit) continue;
      if (chosen.some((x) => x.course_code === s.course_code || sectionsOverlap(x, s).length)) continue;
      if (pool) quota.set(pool, (quota.get(pool) ?? 0) - 1);
      chosen.push(s);
      dfs(i + 1, credits + s.credits);
      chosen.pop();
      if (pool) quota.set(pool, (quota.get(pool) ?? 0) + 1);
    }
  };
  dfs(0, 0);
  // score + filter hard travel fails
  const scored = baskets.map((b) => { const travel = travelGaps(b.sections); return { b, travel, score: scoreBasket(b, prefs, eligMap, travel, pol), hardTravel: travel.some((t) => t.status === 'fail') }; })
    .filter((x) => !x.hardTravel && (pinnedSet.size === 0 || [...pinnedSet].every((id) => x.b.sections.some((s) => s.id === id))))
    .sort((a, b) => b.score - a.score || b.b.credits - a.b.credits);
  // diverse top-3
  const picked: typeof scored = [];
  const sim = (a: Basket, b: Basket) => { const A = new Set(a.sections.map((s) => s.id)), B = new Set(b.sections.map((s) => s.id)); let inter = 0; for (const x of A) if (B.has(x)) inter++; return inter / Math.max(1, new Set([...A, ...B]).size); };
  for (const cand of scored) { if (picked.length >= 3) break; if (picked.every((p) => sim(p.b, cand.b) < 0.6)) picked.push(cand); }
  if (picked.length < 3) for (const cand of scored) { if (picked.length >= 3) break; if (!picked.includes(cand) && picked.every((p) => sim(p.b, cand.b) < 0.85)) picked.push(cand); }
  // Make sure one alternative is a genuinely lighter load when every pick carries the same credits.
  if (picked.length >= 2 && picked.every((p) => p.b.credits === picked[0].b.credits)) {
    const lighter = scored.find((c) => !picked.includes(c) && c.b.credits <= picked[0].b.credits - 3 && c.b.credits >= Math.min(pol.creditMinimum.value, picked[0].b.credits - 3));
    if (lighter) picked[picked.length - 1] = lighter;
  }
  const options: PlanOption[] = picked.map((p, i) => {
    const { checks, credits } = checkBasket(ctx, p.b.sections, prefs, elig, term, opts);
    const first = picked[0];
    const days = [...new Set(p.b.sections.flatMap((s) => s.meetings.map((m) => m.day)))].sort();
    const tradeoffs: string[] = [];
    if (i > 0) {
      const dc = credits - first.b.credits;
      if (dc !== 0) tradeoffs.push(`${dc > 0 ? '+' : ''}${dc} credits vs option A`);
      const firstCodes = new Set(first.b.sections.map((s) => s.course_code));
      const added = p.b.sections.filter((s) => !firstCodes.has(s.course_code)).map((s) => s.course_code);
      const removed = first.b.sections.filter((s) => !p.b.sections.some((x) => x.course_code === s.course_code)).map((s) => s.course_code);
      if (added.length) tradeoffs.push(`Adds ${added.join(', ')}`);
      if (removed.length) tradeoffs.push(`Drops ${removed.join(', ')}`);
      const swapped = p.b.sections.filter((s) => firstCodes.has(s.course_code) && !first.b.sections.some((x) => x.id === s.id)).map((s) => `${s.course_code} → sec ${s.section_no}`);
      if (swapped.length) tradeoffs.push(`Different times: ${swapped.join(', ')}`);
      const dd = days.length - new Set(first.b.sections.flatMap((s) => s.meetings.map((m) => m.day))).size;
      if (dd !== 0) tradeoffs.push(`${dd > 0 ? '+' : ''}${dd} campus day${Math.abs(dd) === 1 ? '' : 's'}`);
    }
    for (const t of p.travel.filter((x) => x.status === 'warn')) tradeoffs.push(`Tight walk ${DAY_LABEL[t.day]} ${t.from} → ${t.to} (~${t.walk_min} min)`);
    for (const s of p.b.sections) if (s.seats_left <= 2) tradeoffs.push(`${s.course_code} sec ${s.section_no}: ${s.seats_left} seat${s.seats_left === 1 ? '' : 's'} left`);
    if (prefs.avoidEarly) for (const s of p.b.sections) for (const m of s.meetings) if (early(m)) tradeoffs.push(`Early class ${s.course_code} ${DAY_LABEL[m.day]} ${m.start}`);
    for (const s of p.b.sections) if (eligMap.get(s.course_code)?.conditional) tradeoffs.push(`${s.course_code} is conditional on passing an in-progress prerequisite`);
    const label = i === 0 ? { en: 'Best match', ar: 'الأنسب' } : credits < first.b.credits ? { en: 'Lighter load', ar: 'عبء أخف' } : tradeoffs.some((t) => t.startsWith('Adds')) ? { en: 'Different course mix', ar: 'مزيج مقررات مختلف' } : days.length < new Set(first.b.sections.flatMap((s) => s.meetings.map((m) => m.day))).size ? { en: 'Compact week', ar: 'أسبوع مضغوط' } : { en: 'Different times', ar: 'أوقات مختلفة' };
    return {
      id: String.fromCharCode(65 + i), label_en: label.en, label_ar: label.ar, section_ids: p.b.sections.map((s) => s.id), credits,
      courses: p.b.sections.map((s) => ({ code: s.course_code, title_en: s.title_en, title_ar: s.title_ar, credits: s.credits, section_id: s.id, section_no: s.section_no, instructor: s.instructor, meetings: s.meetings, seats_left: s.seats_left })),
      checks, score: Math.round(p.score * 10) / 10, tradeoffs: [...new Set(tradeoffs)], travel: p.travel, days, feasible: hardFails(checks).length === 0
    };
  });
  return { options, notes, explored: leaves, eligible: elig };
}
