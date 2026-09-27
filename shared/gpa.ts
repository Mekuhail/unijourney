/**
 * Grade policy and GPA arithmetic shared by the server (transcript GPA, portfolio, career matching) and the client
 * (GPA planner). One source, so the planner, the portfolio and the forecasts can never disagree.
 *
 * GPA = Σ(grade points × GPA-eligible credits) / Σ(GPA-eligible credits). Zero-credit courses, pass/fail grades,
 * transfer/equivalency credit and withdrawals never enter the denominator. Repeats follow `policy.repeat`.
 * Missing grades are never treated as zero: they are reported as missing and left out of every figure.
 */

export type RepeatRule = 'latest' | 'highest' | 'all';
export type Rounding = 'round' | 'truncate';

export interface GradePolicy {
  id: string;
  name_en: string;
  name_ar: string;
  scale: number;
  /** Letter → grade points. */
  points: Record<string, number>;
  /** Percentage floor for each letter, highest first. Used only for estimates, never for official grades. */
  bands: Array<{ letter: string; min: number }>;
  /** Grades that earn credit but never count in the GPA (pass, transfer/equivalency). */
  creditOnly: string[];
  /** Grades that neither count in the GPA nor earn credit (withdrawn, incomplete, no pass). */
  noCredit: string[];
  repeat: RepeatRule;
  rounding: Rounding;
  decimals: number;
  /** false: the percentage bands and repeat rule are not verified against a published YU regulation. */
  verified: boolean;
  source_en: string;
  source_ar: string;
}

/**
 * YU's published grading scale: Examinations Policy and Procedures V3.0 (15 June 2023, effective 9 July 2023), p. 3.
 * Repeats: the Academic Progress and Credit Load policy V6.3 (effective 21 May 2025) keeps a failed attempt in the
 * CGPA after a retake and counts every later attempt, and a passed course cannot be repeated, so every attempt counts.
 * Rounding to two decimals is an assumption (no published rule was found). Every setting stays editable in the planner.
 */
export const YU_POLICY: GradePolicy = {
  id: 'yu-2023',
  name_en: 'YU grading scale (Examinations Policy V3.0)',
  name_ar: 'سلّم الدرجات بجامعة اليمامة (سياسة الاختبارات، الإصدار 3.0)',
  scale: 4,
  // DN (denied for absence) is counted like F here: an assumption to confirm with the Registrar.
  points: { 'A+': 4, A: 3.75, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0, DN: 0 },
  bands: [
    { letter: 'A+', min: 95 }, { letter: 'A', min: 90 }, { letter: 'B+', min: 85 }, { letter: 'B', min: 80 }, { letter: 'C+', min: 75 },
    { letter: 'C', min: 70 }, { letter: 'D+', min: 65 }, { letter: 'D', min: 60 }, { letter: 'F', min: 0 }
  ],
  creditOnly: ['P', 'TR', 'EX'],
  noCredit: ['W', 'IC', 'NP', 'AU'],
  repeat: 'all',
  rounding: 'round',
  decimals: 2,
  verified: true,
  source_en: 'Letters, marks and points: YU Examinations Policy and Procedures V3.0 (effective 9 July 2023). Repeats: Academic Progress and Credit Load policy V6.3 (effective 21 May 2025). Two-decimal rounding and DN counted as F are assumptions.',
  source_ar: 'التقديرات والدرجات والنقاط: سياسة وإجراءات الاختبارات بجامعة اليمامة، الإصدار 3.0 (سارية من 9 يوليو 2023). إعادة المقررات: سياسة التقدّم الأكاديمي والعبء الدراسي، الإصدار 6.3 (سارية من 21 مايو 2025). التقريب إلى منزلتين واحتساب DN مثل F افتراضان.'
};

export const POLICY_SOURCES = [
  { label_en: 'Examinations Policy and Procedures V3.0', label_ar: 'سياسة وإجراءات الاختبارات 3.0', url: 'https://yu.edu.sa/wp-content/uploads/2023/06/Updated-Examinations-Policy-and-Procedures-V-3.0.pdf' },
  { label_en: 'Academic Progress and Credit Load policy V6.3', label_ar: 'سياسة التقدّم الأكاديمي والعبء الدراسي 6.3', url: 'https://yu.edu.sa/wp-content/uploads/2025/05/Policy-on-YU-Academic-Progress-and-Credit-Load-Requirements-V6.3.pdf' }
];

export const DEFAULT_POLICY = YU_POLICY;

export function roundGpa(x: number, p: Pick<GradePolicy, 'rounding' | 'decimals'> = DEFAULT_POLICY): number {
  const f = 10 ** p.decimals;
  // The epsilon keeps 3.745 from becoming 3.74 through binary floating point.
  return p.rounding === 'truncate' ? Math.floor(x * f + 1e-9) / f : Math.round(x * f + 1e-9) / f;
}

export function letterForPercent(percent: number, p: GradePolicy = DEFAULT_POLICY): string {
  for (const b of p.bands) if (percent >= b.min) return b.letter;
  return p.bands[p.bands.length - 1]?.letter ?? 'F';
}

export function pointsFor(letter: string | null | undefined, p: GradePolicy = DEFAULT_POLICY): number | null {
  if (!letter) return null;
  const v = p.points[letter];
  return v === undefined ? null : v;
}

// ------------------------------------------------------------------ transcript GPA
export interface GradeRow {
  course_code: string;
  term: string;
  credits: number;
  grade: string | null;
  /** completed | equivalent | enrolled | planned | withdrawn | failed | estimate | scenario */
  status: string;
  /** Planner rows: where the grade came from. Official rows leave it empty. */
  source?: 'official' | 'estimate' | 'scenario';
}

export type ExcludedReason = 'zero_credit' | 'credit_only' | 'no_credit' | 'no_grade' | 'unknown_grade' | 'repeat_replaced';

export interface GpaResult {
  gpa: number | null;
  /** Unrounded, for further arithmetic. */
  raw: number | null;
  points: number;
  gpaCredits: number;
  earnedCredits: number;
  counted: GradeRow[];
  excluded: Array<{ row: GradeRow; reason: ExcludedReason }>;
}

/** GPA over graded rows. Rows without a grade (in progress, not estimated) are listed, never counted as zero. */
export function computeGpa(rows: GradeRow[], p: GradePolicy = DEFAULT_POLICY): GpaResult {
  const excluded: GpaResult['excluded'] = [];
  const eligible: GradeRow[] = [];
  let earned = 0;
  const earnedCodes = new Set<string>();
  for (const r of rows) {
    const g = r.grade?.trim().toUpperCase() ?? null;
    if (!g) { excluded.push({ row: r, reason: 'no_grade' }); continue; }
    if (p.noCredit.includes(g)) { excluded.push({ row: r, reason: 'no_credit' }); continue; }
    if (p.creditOnly.includes(g)) {
      excluded.push({ row: r, reason: 'credit_only' });
      if (!earnedCodes.has(r.course_code)) { earned += r.credits; earnedCodes.add(r.course_code); }
      continue;
    }
    const pts = p.points[g];
    if (pts === undefined) { excluded.push({ row: r, reason: 'unknown_grade' }); continue; }
    if (!(r.credits > 0)) { excluded.push({ row: r, reason: 'zero_credit' }); continue; }
    eligible.push({ ...r, grade: g });
  }
  // Repeats: one attempt per course unless the policy counts all attempts.
  const counted: GradeRow[] = [];
  if (p.repeat === 'all') counted.push(...eligible);
  else {
    const byCode = new Map<string, GradeRow[]>();
    for (const r of eligible) byCode.set(r.course_code, [...(byCode.get(r.course_code) ?? []), r]);
    for (const attempts of byCode.values()) {
      const keep = attempts.reduce((best, r) => {
        if (p.repeat === 'latest') return termOrder(r) >= termOrder(best) ? r : best;
        const a = p.points[r.grade!]!, b = p.points[best.grade!]!;
        return a > b || (a === b && termOrder(r) >= termOrder(best)) ? r : best;
      });
      counted.push(keep);
      for (const r of attempts) if (r !== keep) excluded.push({ row: r, reason: 'repeat_replaced' });
    }
  }
  let pts = 0, credits = 0;
  for (const r of counted) {
    pts += p.points[r.grade!]! * r.credits;
    credits += r.credits;
    if (p.points[r.grade!]! > 0 && !earnedCodes.has(r.course_code)) { earned += r.credits; earnedCodes.add(r.course_code); }
  }
  const raw = credits ? pts / credits : null;
  return { gpa: raw === null ? null : roundGpa(raw, p), raw, points: pts, gpaCredits: credits, earnedCredits: earned, counted, excluded };
}

/** Terms sort as "YYYY-S"; planner rows ("plan-…") sort after every real term, in the order they were added. */
function termOrder(r: GradeRow): string {
  return r.term;
}

// ------------------------------------------------------------------ current-course estimates
export type ComponentCategory = 'midterm' | 'quiz' | 'assignment' | 'project' | 'lab' | 'presentation' | 'participation' | 'final' | 'other';

export interface GradeComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  /** Share of the course grade, in percent. null = not decided yet. */
  weight: number | null;
  /** Either earned/max or a direct percentage; both null = not graded yet. */
  earned: number | null;
  max: number | null;
  percent: number | null;
}

export interface CourseInput {
  id: string;
  code: string;
  title: string;
  credits: number;
  /** components: estimate from assessments; final: a known or expected final grade; none: not estimated. */
  mode: 'components' | 'final' | 'none';
  finalGrade: string | null;
  finalPercent: number | null;
  components: GradeComponent[];
  /** Percent assumed for every part not graded yet. null = assume the same as the average so far. */
  assumeRemaining: number | null;
  passFail: boolean;
}

export type EstimateIssue =
  | { code: 'weights_over'; total: number }
  | { code: 'weights_under'; total: number }
  | { code: 'missing_weight'; names: string[] }
  | { code: 'score_over_max'; names: string[] }
  | { code: 'invalid_max'; names: string[] }
  | { code: 'unknown_grade'; grade: string };

export interface CourseEstimate {
  /** complete: every weight graded; partial: some graded; empty: nothing to go on; invalid: the numbers cannot add up. */
  status: 'complete' | 'partial' | 'empty' | 'invalid';
  weightTotal: number;
  gradedWeight: number;
  /** Average over the graded part only. */
  soFar: number | null;
  /** Course percentage with the ungraded part at the assumption. */
  projected: number | null;
  assumption: 'same_as_so_far' | 'custom' | 'none';
  /** Course percentage if everything left scored 0 % / 100 %. */
  min: number | null;
  max: number | null;
  letter: string | null;
  points: number | null;
  issues: EstimateIssue[];
}

export function componentPercent(c: GradeComponent): number | null {
  if (c.percent !== null && Number.isFinite(c.percent)) return c.percent;
  if (c.earned !== null && c.max !== null && c.max > 0) return (c.earned / c.max) * 100;
  return null;
}

export function estimateCourse(c: CourseInput, p: GradePolicy = DEFAULT_POLICY): CourseEstimate {
  const base: CourseEstimate = { status: 'empty', weightTotal: 0, gradedWeight: 0, soFar: null, projected: null, assumption: 'none', min: null, max: null, letter: null, points: null, issues: [] };
  if (c.mode === 'none') return base;
  if (c.mode === 'final') {
    const letter = c.finalGrade ? c.finalGrade.toUpperCase() : c.finalPercent !== null ? letterForPercent(c.finalPercent, p) : null;
    if (!letter) return base;
    if (c.passFail) return { ...base, status: 'complete', letter, projected: c.finalPercent };
    const pts = pointsFor(letter, p);
    if (pts === null) return { ...base, status: 'invalid', issues: [{ code: 'unknown_grade', grade: letter }] };
    return { ...base, status: 'complete', letter, points: pts, projected: c.finalPercent, min: c.finalPercent, max: c.finalPercent };
  }
  const issues: EstimateIssue[] = [];
  const unweighted = c.components.filter((x) => x.weight === null || !Number.isFinite(x.weight));
  if (unweighted.length) issues.push({ code: 'missing_weight', names: unweighted.map((x) => x.name) });
  const overMax = c.components.filter((x) => x.earned !== null && x.max !== null && x.max > 0 && x.earned > x.max);
  if (overMax.length) issues.push({ code: 'score_over_max', names: overMax.map((x) => x.name) });
  const badMax = c.components.filter((x) => x.earned !== null && x.max !== null && x.max <= 0);
  if (badMax.length) issues.push({ code: 'invalid_max', names: badMax.map((x) => x.name) });
  const weighted = c.components.filter((x) => x.weight !== null && Number.isFinite(x.weight) && x.weight > 0);
  const weightTotal = round2(weighted.reduce((s, x) => s + x.weight!, 0));
  if (weightTotal > 100.0001) {
    // More than 100 % of a grade cannot be scored: the plan is mathematically impossible until fixed.
    return { ...base, status: 'invalid', weightTotal, issues: [{ code: 'weights_over', total: weightTotal }, ...issues] };
  }
  if (weightTotal < 99.9999) issues.push({ code: 'weights_under', total: weightTotal });
  const graded = weighted.map((x) => ({ w: x.weight!, pct: componentPercent(x) })).filter((x): x is { w: number; pct: number } => x.pct !== null);
  const gradedWeight = round2(graded.reduce((s, x) => s + x.w, 0));
  const contribution = graded.reduce((s, x) => s + (x.w * x.pct) / 100, 0); // points out of 100
  const soFar = gradedWeight > 0 ? (contribution / gradedWeight) * 100 : null;
  // Everything not graded yet, including weight nobody has assigned, is unknown.
  const unknown = Math.max(0, 100 - gradedWeight);
  const min = gradedWeight > 0 || c.assumeRemaining !== null ? contribution : null;
  const max = min === null ? null : contribution + unknown;
  let projected: number | null = null;
  let assumption: CourseEstimate['assumption'] = 'none';
  if (c.assumeRemaining !== null) { projected = contribution + (unknown * c.assumeRemaining) / 100; assumption = 'custom'; }
  else if (soFar !== null) { projected = contribution + (unknown * soFar) / 100; assumption = 'same_as_so_far'; }
  const letter = projected === null ? null : letterForPercent(projected, p);
  const status: CourseEstimate['status'] = gradedWeight === 0 ? (projected === null ? 'empty' : 'partial') : unknown < 0.0001 ? 'complete' : 'partial';
  return {
    status, weightTotal, gradedWeight, soFar: soFar === null ? null : round2(soFar), projected: projected === null ? null : round2(projected), assumption,
    min: min === null ? null : round2(min), max: max === null ? null : round2(max),
    letter: c.passFail ? letter : letter, points: c.passFail || letter === null ? null : pointsFor(letter, p), issues
  };
}

/** Percentage needed on everything not graded yet to finish with at least `targetLetter`. */
export function neededOnRemaining(c: CourseInput, targetLetter: string, p: GradePolicy = DEFAULT_POLICY): { state: 'secured' | 'possible' | 'impossible' | 'unknown'; percent: number | null } {
  const band = p.bands.find((b) => b.letter === targetLetter);
  const est = estimateCourse({ ...c, assumeRemaining: 0 }, p);
  if (!band || est.status === 'invalid' || est.min === null) return { state: 'unknown', percent: null };
  const unknown = 100 - est.gradedWeight;
  const need = band.min - est.min;
  if (need <= 0) return { state: 'secured', percent: 0 };
  if (unknown <= 0) return { state: 'impossible', percent: null };
  const pct = (need / unknown) * 100;
  return pct > 100 ? { state: 'impossible', percent: round2(pct) } : { state: 'possible', percent: round2(pct) };
}

// ------------------------------------------------------------------ forecasts and targets
/** Grade points per credit the student needs on `futureCredits` to reach `target` cumulatively. */
export function requiredAverage(known: { points: number; credits: number }, futureCredits: number, target: number, scale = 4): { state: 'secured' | 'possible' | 'impossible' | 'no_credits'; average: number | null; range: [number, number] | null } {
  const total = known.credits + futureCredits;
  if (futureCredits <= 0) return { state: 'no_credits', average: null, range: known.credits ? [known.points / known.credits, known.points / known.credits] : null };
  const range: [number, number] = [known.points / total, (known.points + scale * futureCredits) / total];
  const need = (target * total - known.points) / futureCredits;
  if (need <= 0) return { state: 'secured', average: 0, range };
  if (need > scale + 1e-9) return { state: 'impossible', average: need, range };
  return { state: 'possible', average: need, range };
}

export type TargetStatus = 'on_track' | 'close' | 'below';

/**
 * Planning indicator only. below: the projection misses the target; close: it meets it with less than `headroom` to
 * spare; on_track: it clears it by at least `headroom`. Compared on the rounded GPA the policy would show.
 */
export function targetStatus(projected: number, target: number, headroom = 0.1, p: Pick<GradePolicy, 'rounding' | 'decimals'> = DEFAULT_POLICY): TargetStatus {
  const g = roundGpa(projected, p);
  if (g < target) return 'below';
  return g < roundGpa(target + headroom, p) ? 'close' : 'on_track';
}

// ------------------------------------------------------------------ scholarship reference
export interface ScholarshipCategory { id: string; min_gpa: number; discount: number }
export interface ScholarshipPolicy {
  name_en: string;
  name_ar: string;
  url: string;
  checked: string;
  effective: string | null;
  note_en: string;
  note_ar: string;
  categories: ScholarshipCategory[];
}

/** Continuation thresholds as published by YU (the PDF carries no version or effective date). A planning reference only. */
export const YU_EXCELLENCE_SCHOLARSHIP: ScholarshipPolicy = {
  name_en: 'Excellence Scholarship Program: Terms and Conditions',
  name_ar: 'برنامج منح التفوق: الشروط والأحكام',
  url: 'https://yu.edu.sa/wp-content/uploads/2026/01/Scholarship-Policy.pdf',
  checked: '2026-09-27',
  effective: null,
  note_en: 'Scholarships are reviewed at the end of each semester and the President decides. Falling below a threshold can mean a lower category or losing the scholarship; the 30% category is revoked immediately.',
  note_ar: 'تُراجَع المنح في نهاية كل فصل ويعود القرار لرئيس الجامعة. الانخفاض عن الحد قد يعني فئة أدنى أو فقدان المنحة؛ وتُلغى فئة 30% فورًا.',
  categories: [
    { id: 'excellence-50', min_gpa: 3.75, discount: 50 },
    { id: 'excellence-40', min_gpa: 3.5, discount: 40 },
    { id: 'excellence-30', min_gpa: 3.3, discount: 30 }
  ]
};

/** Other published YU GPA lines a student may want to plan towards. */
export const YU_GPA_MARKERS = [
  { id: 'deans-list', min_gpa: 3.6, label_en: "Dean's Honors List (also needs C or better in every course and 24+ credits)", label_ar: 'قائمة العميد الشرفية (تتطلب أيضًا تقدير C فأعلى في كل مقرر و24 ساعة على الأقل)', url: 'https://yu.edu.sa/wp-content/uploads/2024/12/Policy-on-Deans-Honor-List-v1.1-12252024.pdf' }
];

function round2(x: number) {
  return Math.round(x * 100 + 1e-9) / 100;
}
