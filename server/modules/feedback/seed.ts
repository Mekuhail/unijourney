import { j } from '../../core/db.ts';
import { localToIso } from '../../core/clock.ts';
import type { SeedContext } from '../../seed/context.ts';
import { membersOn } from '../../seed/members.ts';
import { classifyComment, TEACHING_KPIS, type KpiKey } from './kpi.ts';
import { END_TERM, PUBLIC_TERMS } from './windows.ts';

/**
 * Anonymous course feedback for the last three completed terms, generated deterministically from per-instructor and
 * per-course profiles so the KPI pages have realistic spread, trends and a few courses below the privacy threshold.
 * Also seeds past-term sections (closed) so each course has a real instructor per term, a "you said, we did" loop,
 * two responses held for review and two help tickets.
 */

// Teaching profile per instructor: clarity, grading, support, organisation (1–5 means).
const PROFILES: Record<string, [number, number, number, number]> = {
  'Dr. Mohammed Al-Zahrani': [4.5, 4.1, 4.4, 4.2], 'Dr. Amal Al-Qahtani': [4.7, 4.4, 4.8, 4.5], 'Dr. Khalid Al-Shammari': [3.8, 3.9, 4.0, 3.4],
  'Dr. Noha Al-Rashid': [4.3, 4.5, 4.2, 4.6], 'Dr. Fahad Al-Malki': [4.0, 3.6, 3.8, 4.0], 'Dr. Reem Al-Juhani': [4.6, 4.2, 4.5, 4.3],
  'Dr. Yousef Al-Ghamdi': [3.9, 4.2, 4.3, 3.8], 'Dr. Huda Al-Saleh': [4.4, 4.0, 4.6, 4.1], 'Dr. Tariq Al-Amri': [3.8, 3.6, 4.1, 3.7],
  'Dr. Lama Al-Subaie': [4.5, 4.6, 4.4, 4.7], 'Dr. Saad Al-Mutlaq': [4.1, 3.8, 3.9, 4.2], 'Dr. Maha Al-Harthi': [4.2, 4.3, 4.6, 4.0],
  'Dr. Bandar Al-Otaibi': [3.6, 4.0, 3.7, 3.9], 'Dr. Dalal Al-Anazi': [4.4, 4.1, 4.3, 4.4]
};
// Course profile: workload (higher = more balanced), value, typical study hours per week.
const COURSES: Record<string, [number, number, number]> = {
  'CIS 201': [4.0, 4.1, 6], 'CIS 202': [3.9, 4.2, 7], 'MIS 201': [4.2, 3.8, 4], 'PHY 203': [3.5, 3.6, 7], 'MTH 204': [3.4, 3.7, 8],
  'CIS 221': [3.6, 4.4, 8], 'SWE 202': [3.8, 4.3, 6], 'NES 212': [3.9, 4.0, 5], 'MTH 304': [3.5, 3.8, 7], 'ENG 201': [4.3, 3.9, 3], 'ARB 202': [4.4, 3.7, 3],
  'CIS 304': [3.7, 4.3, 7], 'CIS 386': [3.9, 4.5, 6], 'CIS 383': [3.6, 4.1, 7], 'SWE 300': [3.8, 4.4, 6], 'SWE 301': [3.7, 4.2, 7], 'MTH 301': [3.3, 3.6, 8],
  'CIS 321': [3.1, 4.6, 10], 'CIS 381': [3.8, 4.0, 6], 'CIS 316': [3.4, 4.6, 9], 'SWE 302': [3.9, 4.4, 6], 'SWE 312': [3.7, 4.2, 7], 'SWE 322': [3.8, 4.3, 6]
};
const COURSE_TERMS: Record<string, string[]> = {
  '2024-2': ['CIS 201', 'CIS 202', 'MIS 201', 'PHY 203', 'MTH 204', 'CIS 221', 'SWE 202', 'CIS 304', 'CIS 386', 'SWE 300', 'CIS 321', 'CIS 316', 'SWE 302'],
  '2025-1': ['CIS 201', 'CIS 202', 'CIS 221', 'SWE 202', 'NES 212', 'MTH 304', 'ENG 201', 'ARB 202', 'CIS 304', 'SWE 301', 'CIS 321', 'CIS 381', 'SWE 312', 'SWE 322'],
  '2025-2': ['CIS 202', 'PHY 203', 'MTH 204', 'CIS 304', 'CIS 386', 'CIS 383', 'SWE 300', 'SWE 301', 'MTH 301', 'CIS 321', 'CIS 316', 'SWE 302', 'SWE 322']
};
/** Stories the trend lines should tell: an improvement after a department action, and one dip. */
const DRIFT: Array<{ course: string; kpi: KpiKey; by: Record<string, number> }> = [
  { course: 'CIS 321', kpi: 'grading', by: { '2024-2': -1.0, '2025-1': -0.5, '2025-2': 0.1 } },
  { course: 'MTH 301', kpi: 'clarity', by: { '2025-2': -0.6 } },
  { course: 'CIS 316', kpi: 'organisation', by: { '2024-2': -0.5, '2025-2': 0.2 } }
];
const BELOW_THRESHOLD = new Set(['2024-2|CIS 386', '2025-1|ARB 202']);
const KHOBAR_ALSO = new Set(['CIS 202', 'PHY 203', 'MTH 204']);

const COMMENTS: Record<string, { s: [string, string]; g: [string, string] }> = {
  examples: { s: ['Great worked examples in every lecture.', 'أمثلة محلولة رائعة في كل محاضرة.'], g: ['More worked examples before the quizzes would help.', 'نحتاج أمثلة محلولة أكثر قبل الاختبارات.'] },
  pace: { s: ['The pace of the lectures felt just right.', 'سرعة الشرح مناسبة جدًا.'], g: ['The pace was too fast in the second half.', 'الشرح سريع في النصف الثاني من الفصل.'] },
  rubric: { s: ['The grading criteria were clear from day one.', 'معايير التقييم واضحة من البداية.'], g: ['Grading criteria were unclear for the project.', 'معايير التقييم غير واضحة في المشروع.'] },
  feedback_speed: { s: ['Marks back within a week with useful comments.', 'تصحيح الواجبات في وقته مع ملاحظات مفيدة.'], g: ['Marks back were late after the midterm.', 'تصحيح الواجبات متأخر بعد الاختبار النصفي.'] },
  availability: { s: ['Replies to email quickly and keeps office hours.', 'متعاون جدًا ويرد على الإيميل بسرعة.'], g: ['Hard to reach outside office hours.', 'صعب التواصل خارج الساعات المكتبية.'] },
  materials: { s: ['Slides and lecture notes are excellent for revision.', 'الشرائح والملخصات ممتازة للمراجعة.'], g: ['Slides were not uploaded on time.', 'الشرائح لا تُرفع في وقتها.'] },
  deadlines: { s: ['Well organised course and every deadline announced early.', 'المقرر منظم والمواعيد معلنة مبكرًا.'], g: ['Deadlines changed without notice.', 'المواعيد تتغير بدون إشعار.'] },
  workload: { s: ['The workload was fair for three credit hours.', 'الواجبات مناسبة لعدد الساعات.'], g: ['Too many assignments in the same week.', 'الواجبات كثيرة في نفس الأسبوع.'] },
  projects: { s: ['The project was practical and close to real work.', 'المشروع عملي وقريب من سوق العمل.'], g: ['Wish the labs had more practical projects.', 'أتمنى مشاريع عملية أكثر في المعمل.'] },
  engagement: { s: ['Lectures are interactive and interesting.', 'المحاضرات تفاعلية وممتعة.'], g: ['Lectures could be more interactive.', 'المحاضرات تحتاج تفاعل أكثر.'] }
};
const THEMES_BY_KPI: Record<KpiKey, string[]> = {
  clarity: ['examples', 'pace'], grading: ['rubric', 'feedback_speed'], support: ['availability'], organisation: ['materials', 'deadlines'], workload: ['workload'], value: ['projects', 'engagement']
};

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const clamp = (x: number) => Math.max(1, Math.min(5, Math.round(x)));

export function seedFeedback(ctx: SeedContext) {
  const { db: d, users: U, term: CURRENT } = ctx;
  const INSTRUCTORS = Object.keys(PROFILES);
  const current = new Map<string, string>();
  for (const r of d.all<{ course_code: string; instructor: string }>("SELECT course_code, instructor FROM course_sections WHERE term IN (?, ?) AND campus_id = 'riyadh' ORDER BY term, section_no", CURRENT, ctx.nextTerm)) {
    if (!current.has(r.course_code)) current.set(r.course_code, r.instructor);
  }
  const instructorFor = (course: string, term: string, campus: string) => {
    const base = current.get(course) ?? INSTRUCTORS[Math.abs(hash(course)) % INSTRUCTORS.length];
    // Occasional hand-overs so a course shows more than one instructor across terms.
    if (campus === 'khobar') return INSTRUCTORS[Math.abs(hash(`${course}k`)) % INSTRUCTORS.length];
    return term === '2024-2' && Math.abs(hash(course)) % 3 === 0 ? INSTRUCTORS[Math.abs(hash(`${course}${term}`)) % INSTRUCTORS.length] : base;
  };

  const riyadh = membersOn('riyadh');
  const khobar = membersOn('khobar');
  for (const term of PUBLIC_TERMS) {
    for (const course of COURSE_TERMS[term]) {
      for (const campus of KHOBAR_ALSO.has(course) && term === END_TERM ? ['riyadh', 'khobar'] : ['riyadh']) {
        const instructor = instructorFor(course, term, campus);
        const sectionId = `sec_${term}_${course.replace(/\s+/g, '').toLowerCase()}_${campus === 'riyadh' ? '01' : 'k1'}`;
        const pool = campus === 'riyadh' ? riyadh : khobar;
        const r = rng(hash(`${term}|${course}|${campus}`));
        const n = BELOW_THRESHOLD.has(`${term}|${course}`) ? 3 + (Math.abs(hash(course)) % 2) : Math.min(pool.length, campus === 'riyadh' ? 6 + Math.floor(r() * 9) : 5 + Math.floor(r() * 3));
        d.insert('course_sections', { id: sectionId, course_code: course, term, section_no: campus === 'riyadh' ? '01' : 'K1', instructor, campus_id: campus, capacity: 30, enrolled: Math.max(n + 6, 18 + Math.floor(r() * 10)), meetings: '[]', status: 'closed', notes: 'Past term (course feedback history)' });
        const [cl, gr, su, or] = PROFILES[instructor];
        const [wl, va, hrs] = COURSES[course];
        const drift = (k: KpiKey) => DRIFT.find((x) => x.course === course && x.kpi === k)?.by[term] ?? 0;
        const means: Record<KpiKey, number> = { clarity: cl + drift('clarity'), grading: gr + drift('grading'), support: su + drift('support'), organisation: or + drift('organisation'), workload: wl, value: va };
        const start = Math.floor(r() * pool.length);
        for (let i = 0; i < n; i++) {
          const student = pool[(start + i) % pool.length];
          const ratings = Object.fromEntries((Object.keys(means) as KpiKey[]).map((k) => [k, clamp(means[k] + (r() - 0.5) * 1.8)])) as Record<KpiKey, number>;
          const teachingMean = TEACHING_KPIS.reduce((a, k) => a + ratings[k], 0) / 4;
          const recommend = r() < 0.12 ? null : teachingMean >= 3.6 ? 1 : r() < 0.3 ? 1 : 0;
          // Comment: one sentence about the best-rated KPI, sometimes one about the weakest; a quarter leave none.
          let comment = '';
          if (r() > 0.25) {
            const ordered = (Object.keys(ratings) as KpiKey[]).sort((a, b) => ratings[b] - ratings[a]);
            const arabic = r() < 0.35;
            const pick = (k: KpiKey) => THEMES_BY_KPI[k][Math.floor(r() * THEMES_BY_KPI[k].length)];
            const parts: string[] = [];
            if (ratings[ordered[0]] >= 4) parts.push(COMMENTS[pick(ordered[0])].s[arabic ? 1 : 0]);
            const low = ordered[ordered.length - 1];
            if (ratings[low] <= 3 && r() < 0.8) parts.push(COMMENTS[pick(low)].g[arabic ? 1 : 0]);
            comment = parts.join(' ');
          }
          const when = new Date(localToIso(term === '2024-2' ? '2025-05-20' : term === '2025-1' ? '2025-12-18' : '2026-05-21', '12:00')).toISOString();
          d.insert('course_feedback', {
            id: `fb_${term}_${course.replace(/\s+/g, '').toLowerCase()}_${campus[0]}${i}`, student_id: student, course_code: course, term, section_id: sectionId, instructor, phase: 'end_of_term',
            ratings: j(ratings), recommend, hours_per_week: Math.max(1, Math.round(hrs + (r() - 0.5) * 4)), comment, themes: j(classifyComment(comment)), status: 'published', flags: '[]', created_at: when, updated_at: when
          });
        }
      }
    }
  }

  // Sara already rated one Spring 2026 course; the rest of her Spring courses are waiting for her.
  const saraSection = `sec_${END_TERM}_swe300_01`;
  const saraInstr = d.get<{ instructor: string }>('SELECT instructor FROM course_sections WHERE id = ?', saraSection)?.instructor ?? INSTRUCTORS[0];
  const saraComment = 'The project was practical and close to real work. More worked examples before the quizzes would help.';
  const at = new Date(localToIso('2026-09-24', '21:10')).toISOString();
  d.insert('course_feedback', { id: 'fb_sara_swe300', student_id: U.student, course_code: 'SWE 300', term: END_TERM, section_id: saraSection, instructor: saraInstr, phase: 'end_of_term', ratings: j({ clarity: 4, grading: 4, support: 5, organisation: 4, workload: 3, value: 5 }), recommend: 1, hours_per_week: 7, comment: saraComment, themes: j(classifyComment(saraComment)), status: 'published', flags: '[]', created_at: at, updated_at: at });

  // Two responses held for the quality office (flagged but not blocked).
  const held = [
    { id: 'fb_held_1', student: riyadh[3], course: 'CIS 386', text: 'LECTURES ARE GOOD BUT THE LAB MACHINES NEVER WORK AND WE LOSE HALF THE SESSION', flags: ['shouting'] },
    { id: 'fb_held_2', student: riyadh[5], course: 'SWE 301', text: 'Useful course. Extra practice here: https://example.org/a https://example.org/b https://example.org/c', flags: ['links'] }
  ];
  for (const h of held) {
    const sec = `sec_${END_TERM}_${h.course.replace(/\s+/g, '').toLowerCase()}_01`;
    const instr = d.get<{ instructor: string }>('SELECT instructor FROM course_sections WHERE id = ?', sec)!.instructor;
    const when = new Date(localToIso('2026-09-25', '10:00')).toISOString();
    d.run('DELETE FROM course_feedback WHERE student_id = ? AND course_code = ? AND term = ?', h.student, h.course, END_TERM);
    d.insert('course_feedback', { id: h.id, student_id: h.student, course_code: h.course, term: END_TERM, section_id: sec, instructor: instr, phase: 'end_of_term', ratings: j({ clarity: 4, grading: 4, support: 4, organisation: 3, workload: 3, value: 4 }), recommend: 1, hours_per_week: 6, comment: h.text, themes: j(classifyComment(h.text)), status: 'held', flags: j(h.flags), created_at: when, updated_at: when });
  }

  // "You said, we did": department responses that close the loop on a KPI.
  const act = (id: string, row: Record<string, unknown>, date: string) => d.insert('feedback_actions', { id, course_code: null, instructor: null, author_id: U.reviewer, created_at: new Date(localToIso(date, '10:00')).toISOString(), ...row });
  act('fba_cis321_grading', { course_code: 'CIS 321', kpi: 'grading', body_en: 'Every assignment now ships with its marking rubric, and marks come back within ten working days.', body_ar: 'كل واجب يُنشر الآن مع معايير تقييمه، وتُعاد الدرجات خلال عشرة أيام عمل.' }, '2025-09-07');
  act('fba_mth301_clarity', { course_code: 'MTH 301', kpi: 'clarity', body_en: 'A weekly problem-solving session runs on Tuesdays in C-220, after students asked for more worked examples.', body_ar: 'أُضيفت جلسة أسبوعية لحل المسائل كل ثلاثاء في C-220 بعد أن طلب الطلاب أمثلة محلولة أكثر.' }, '2026-09-06');
  act('fba_cis316_org', { course_code: 'CIS 316', kpi: 'organisation', body_en: 'Lecture slides are now posted on the LMS 24 hours before each class.', body_ar: 'تُنشر شرائح المحاضرات على نظام التعلم قبل كل محاضرة بـ24 ساعة.' }, '2025-09-10');

  // Help desk: one answered ticket and one open ticket for Sara.
  d.insert('help_tickets', { id: 'hlp_sara_1', public_id: 'HLP-2041', user_id: U.student, category: 'question', subject: 'Certifications missing after LinkedIn import', body: 'I imported my LinkedIn export but my AWS certificate did not appear in the portfolio.', page: '/portfolio', status: 'answered', reply: 'The import reads Certifications.csv only when it is in the ZIP. Request the full export (not the quick one) from LinkedIn and import it again; items you already added are skipped.', replied_by: U.reviewer, replied_at: new Date(localToIso('2026-09-22', '11:30')).toISOString(), created_at: new Date(localToIso('2026-09-21', '20:05')).toISOString() });
  d.insert('help_tickets', { id: 'hlp_sara_2', public_id: 'HLP-2057', user_id: U.student, category: 'suggestion', subject: 'Dark mode for the campus map', body: 'The map is very bright at night. A darker map style would be easier on the eyes.', page: '/campus/map', status: 'open', reply: null, replied_by: null, replied_at: null, created_at: new Date(localToIso('2026-09-26', '22:40')).toISOString() });
}
