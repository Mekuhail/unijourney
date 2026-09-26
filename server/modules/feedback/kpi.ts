import { normArabic } from '../../core/moderation.ts';

/**
 * Course and teaching KPIs. Students rate six statements on a 1–5 agreement scale; the public pages only ever show
 * aggregates (means, share of 4–5 ratings, trends, department benchmarks) and theme counts derived from comments.
 * Comment text is never shown to other students.
 */
export const MIN_RESPONSES = 5;

export type KpiKey = 'clarity' | 'grading' | 'support' | 'organisation' | 'workload' | 'value';
export const TEACHING_KPIS: KpiKey[] = ['clarity', 'grading', 'support', 'organisation'];
export const COURSE_KPIS: KpiKey[] = ['workload', 'value'];
export const ALL_KPIS: KpiKey[] = [...TEACHING_KPIS, ...COURSE_KPIS];

/** Bands on the 1–5 mean. No red band: the lowest band is a focus area, framed for improvement. */
export function band(mean: number | null): 'strong' | 'on_track' | 'focus' | null {
  if (mean === null) return null;
  return mean >= 4.2 ? 'strong' : mean >= 3.6 ? 'on_track' : 'focus';
}

/** 0–100 index from a 1–5 mean. */
export const toIndex = (mean: number | null) => (mean === null ? null : Math.round(((mean - 1) / 4) * 100));

// ------------------------------------------------------------------ themes from comments
export interface Theme { key: string; kpi: KpiKey; pattern: RegExp }

/** Keyword themes (English + normalised Arabic). Each maps to the KPI it explains. */
export const THEMES: Theme[] = [
  { key: 'examples', kpi: 'clarity', pattern: /example|worked problem|practice question|exercise|امثل|تمارين|حل مسائل/ },
  { key: 'pace', kpi: 'clarity', pattern: /\bpace\b|too fast|rushed|سرعه الشرح|الشرح سريع|مستعجل/ },
  { key: 'rubric', kpi: 'grading', pattern: /rubric|criteria|marking scheme|grading scheme|معايير|سلم الدرجات|توزيع الدرجات/ },
  { key: 'feedback_speed', kpi: 'grading', pattern: /feedback on (our|my) work|marks back|returned (our|the) (work|assignments)|graded (quickly|late)|تصحيح الواجبات|اعاده الدرجات|ترجع الدرجات/ },
  { key: 'availability', kpi: 'support', pattern: /office hours|replies|responds|reply to email|approachable|ساعات (ال)?مكتبيه|يرد علي|متعاون|قريب من الطلاب/ },
  { key: 'materials', kpi: 'organisation', pattern: /slides|materials|lecture notes|\blms\b|moodle|recordings|الشرائح|المحتوي|الملخصات|التسجيلات/ },
  { key: 'deadlines', kpi: 'organisation', pattern: /deadline|announced early|well organi[sz]ed|schedule|المواعيد|منظم|الجدول/ },
  { key: 'workload', kpi: 'workload', pattern: /workload|assignments|lots of work|heavy|الواجبات|ضغط|عبء/ },
  { key: 'projects', kpi: 'value', pattern: /project|hands-on|\blabs?\b|practical|real[- ]world|مشروع|مشاريع|عملي|المعمل/ },
  { key: 'engagement', kpi: 'value', pattern: /interactive|discussion|engaging|interesting|تفاعل|ممتع|مشوق|نقاش/ }
];

const NEGATIVE_EN = /\b(not|no|never|too|hard to|unclear|confusing|late|slow|rushed|more|wish|should|could|lack|lacks|without|less|heavy)\b/;
const NEGATIVE_AR = /(^|\s)(لا|ليس|غير|صعب|متاخر|متاخره|اتمني|ياليت|يحتاج|تحتاج|ناقص|ناقصه|اكثر|كثيره|كثير|سريع|بدون)(?=\s|$|[.,،!؟])/;

export interface ThemeHit { key: string; tone: 'strength' | 'suggestion' }

/** Splits a comment into sentences and tags each theme mentioned, as a strength or as a suggestion. */
export function classifyComment(comment: string): ThemeHit[] {
  const hits = new Map<string, ThemeHit>();
  for (const raw of comment.split(/[.!?؟\n]+/)) {
    const s = normArabic(raw).trim();
    if (!s) continue;
    const tone = NEGATIVE_EN.test(s) || NEGATIVE_AR.test(s) ? 'suggestion' : 'strength';
    for (const t of THEMES) if (t.pattern.test(s) && !hits.has(t.key)) hits.set(t.key, { key: t.key, tone });
  }
  return [...hits.values()];
}

// ------------------------------------------------------------------ colleges and instructors
export const COLLEGES = [
  { key: 'engineering', en: 'College of Engineering & Architecture', ar: 'كلية الهندسة والعمارة', prefixes: ['CIS', 'SWE', 'CNE', 'NES', 'IE', 'ARC', 'AIA'] },
  { key: 'business', en: 'College of Business', ar: 'كلية الأعمال', prefixes: ['MIS', 'ACC', 'FIN', 'MGT', 'MKT', 'BUS'] },
  { key: 'law', en: 'College of Law', ar: 'كلية القانون', prefixes: ['LAW'] },
  { key: 'arts_sciences', en: 'Deanship of Arts & Sciences', ar: 'عمادة الآداب والعلوم', prefixes: ['MTH', 'PHY', 'CHM', 'STT', 'ENG', 'ARB', 'ISL', 'PHL', 'PSY', 'SOS'] }
] as const;
export type CollegeKey = (typeof COLLEGES)[number]['key'];

export function collegeOf(courseCode: string): CollegeKey {
  const prefix = courseCode.split(/\s+/)[0];
  return (COLLEGES.find((c) => (c.prefixes as readonly string[]).includes(prefix))?.key ?? 'arts_sciences') as CollegeKey;
}

/** Arabic names for the demo instructors (course_sections stores the English name). */
export const INSTRUCTOR_AR: Record<string, string> = {
  'Dr. Mohammed Al-Zahrani': 'د. محمد الزهراني', 'Dr. Amal Al-Qahtani': 'د. أمل القحطاني', 'Dr. Khalid Al-Shammari': 'د. خالد الشمري',
  'Dr. Noha Al-Rashid': 'د. نهى الراشد', 'Dr. Fahad Al-Malki': 'د. فهد المالكي', 'Dr. Reem Al-Juhani': 'د. ريم الجهني',
  'Dr. Yousef Al-Ghamdi': 'د. يوسف الغامدي', 'Dr. Huda Al-Saleh': 'د. هدى الصالح', 'Dr. Tariq Al-Amri': 'د. طارق العمري',
  'Dr. Lama Al-Subaie': 'د. لمى السبيعي', 'Dr. Saad Al-Mutlaq': 'د. سعد المطلق', 'Dr. Maha Al-Harthi': 'د. مها الحارثي',
  'Dr. Bandar Al-Otaibi': 'د. بندر العتيبي', 'Dr. Dalal Al-Anazi': 'د. دلال العنزي'
};

export const slugOf = (name: string) => name.toLowerCase().replace(/^dr\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ------------------------------------------------------------------ aggregation
export interface FeedbackRow { course_code: string; term: string; instructor: string; ratings: Record<KpiKey, number>; recommend: number | null; hours_per_week: number | null; themes: ThemeHit[] }

export interface KpiStat { mean: number | null; favourable: number | null; band: ReturnType<typeof band>; n: number }

export interface Aggregate {
  n: number;
  enough: boolean;
  kpis: Record<KpiKey, KpiStat>;
  index: number | null;
  recommend: number | null;
  hours: number | null;
  strengths: Array<{ key: string; share: number }>;
  suggestions: Array<{ key: string; share: number }>;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Aggregates responses. Below MIN_RESPONSES every number is withheld so no individual rating can be inferred. */
export function aggregate(rows: FeedbackRow[], kpis: KpiKey[] = ALL_KPIS): Aggregate {
  const n = rows.length;
  const enough = n >= MIN_RESPONSES;
  const stat = (k: KpiKey): KpiStat => {
    const vals = rows.map((r) => r.ratings[k]).filter((v): v is number => typeof v === 'number');
    if (!enough || vals.length < MIN_RESPONSES) return { mean: null, favourable: null, band: null, n: vals.length };
    const mean = round1(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { mean, favourable: Math.round((vals.filter((v) => v >= 4).length / vals.length) * 100), band: band(mean), n: vals.length };
  };
  const out = Object.fromEntries(ALL_KPIS.map((k) => [k, stat(k)])) as Record<KpiKey, KpiStat>;
  const means = kpis.map((k) => out[k].mean).filter((m): m is number => m !== null);
  const rec = rows.map((r) => r.recommend).filter((v): v is number => v === 0 || v === 1);
  const hrs = rows.map((r) => r.hours_per_week).filter((v): v is number => typeof v === 'number');
  const count = (tone: ThemeHit['tone']) => {
    const m = new Map<string, number>();
    for (const r of rows) for (const t of r.themes) if (t.tone === tone) m.set(t.key, (m.get(t.key) ?? 0) + 1);
    return [...m.entries()].map(([key, c]) => ({ key, share: Math.round((c / n) * 100) })).filter((x) => x.share >= 15).sort((a, b) => b.share - a.share).slice(0, 3);
  };
  return {
    n, enough,
    kpis: out,
    index: enough && means.length ? toIndex(means.reduce((a, b) => a + b, 0) / means.length) : null,
    recommend: enough && rec.length >= MIN_RESPONSES ? Math.round((rec.filter((v) => v === 1).length / rec.length) * 100) : null,
    hours: enough && hrs.length >= MIN_RESPONSES ? round1(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    strengths: enough ? count('strength') : [],
    suggestions: enough ? count('suggestion') : []
  };
}
