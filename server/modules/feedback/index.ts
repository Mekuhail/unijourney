import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import type { AppModule } from '../index.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, conflict, unprocessable } from '../../core/http.ts';
import { gate, hasRole, requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { checkText } from '../../core/moderation.ts';
import { CURRENT_TERM } from '../../core/settings.ts';
import { aggregate, ALL_KPIS, classifyComment, COLLEGES, collegeOf, COURSE_KPIS, INSTRUCTOR_AR, MIN_RESPONSES, slugOf, TEACHING_KPIS, type FeedbackRow, type KpiKey } from './kpi.ts';
import { END_TERM, PUBLIC_TERMS, termLabelOf, windowState, type Phase } from './windows.ts';
import { seedFeedback } from './seed.ts';

/**
 * Feedback & help. Students rate courses they took (end of term) or are taking (mid-term check-in); everyone sees
 * only KPI aggregates with a minimum of five responses. Comment text stays private: it is reduced to theme counts,
 * and only the quality office sees text, for responses held by the moderation filter.
 */
const router = Router();
// Students rate and ask for help; students and quality staff read the KPI pages. /staff/* keeps its own role checks.
router.use(['/responses', '/mine', '/help'], gate('feedback'));
router.use(['/courses', '/instructors', '/overview'], gate('feedbackKpis'));

const isStaff = (u: User) => hasRole(u, 'reviewer', 'registrar');
function requireStaff(u: User) {
  if (!isStaff(u)) throw forbidden('Only the quality office can do that');
}

interface Stored { id: string; student_id: string; course_code: string; term: string; section_id: string | null; instructor: string; phase: string; ratings: string; recommend: number | null; hours_per_week: number | null; comment: string; themes: string; status: string; flags: string; created_at: string; updated_at: string }

const toRow = (r: Stored): FeedbackRow => ({ course_code: r.course_code, term: r.term, instructor: r.instructor, ratings: pj(r.ratings, {} as Record<KpiKey, number>), recommend: r.recommend, hours_per_week: r.hours_per_week, themes: pj(r.themes, []) });

/** Published end-of-term responses from the public terms: the only rows any KPI page is built from. */
function publicRows(where = '1=1', ...params: unknown[]): FeedbackRow[] {
  return db().all<Stored>(`SELECT * FROM course_feedback WHERE status = 'published' AND phase = 'end_of_term' AND term IN (${PUBLIC_TERMS.map(() => '?').join(',')}) AND ${where}`, ...PUBLIC_TERMS, ...params).map(toRow);
}

function courseTitle(code: string) {
  const c = db().get<{ title_en: string; title_ar: string }>('SELECT title_en, title_ar FROM courses WHERE code = ?', code);
  return { title_en: c?.title_en ?? code, title_ar: c?.title_ar ?? code };
}

function instructorView(name: string) {
  return { slug: slugOf(name), name_en: name, name_ar: INSTRUCTOR_AR[name] ?? name };
}

const allInstructors = () => [...new Set(publicRows().map((r) => r.instructor))];
function instructorBySlug(slug: string) {
  const name = allInstructors().find((n) => slugOf(n) === slug);
  if (!name) throw notFound('No feedback found for this instructor');
  return name;
}

/** Most common college across an instructor's courses. */
function instructorCollege(rows: FeedbackRow[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(collegeOf(r.course_code), (counts.get(collegeOf(r.course_code)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'arts_sciences';
}

/** Mean of instructor-level means within a college, per KPI (each instructor weighs the same). */
function collegeBenchmark(college: string, by: 'instructor' | 'course') {
  const groups = new Map<string, FeedbackRow[]>();
  for (const r of publicRows().filter((x) => collegeOf(x.course_code) === college)) {
    const key = by === 'instructor' ? r.instructor : r.course_code;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out = {} as Record<KpiKey, number | null>;
  for (const k of ALL_KPIS) {
    const means = [...groups.values()].map((g) => aggregate(g).kpis[k].mean).filter((m): m is number => m !== null);
    out[k] = means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 10) / 10 : null;
  }
  return out;
}

/** Per-term KPI means for trend lines; a term below the threshold is left out rather than shown. */
function trend(rows: FeedbackRow[], kpis: KpiKey[]) {
  return PUBLIC_TERMS.map((term) => {
    const a = aggregate(rows.filter((r) => r.term === term), kpis);
    const label = termLabelOf(term);
    return { term, label_en: label.en, label_ar: label.ar, n: a.n, index: a.index, kpis: Object.fromEntries(kpis.map((k) => [k, a.kpis[k].mean])) };
  });
}

function actionsFor(where: { course?: string; instructor?: string }) {
  const rows = where.course
    ? db().all('SELECT * FROM feedback_actions WHERE course_code = ? ORDER BY created_at DESC', where.course)
    : db().all('SELECT * FROM feedback_actions WHERE instructor = ? OR course_code IN (SELECT DISTINCT course_code FROM course_feedback WHERE instructor = ?) ORDER BY created_at DESC', where.instructor, where.instructor);
  return rows.map((r) => ({ id: r.id, course_code: r.course_code, instructor: r.instructor, kpi: r.kpi, body_en: r.body_en, body_ar: r.body_ar, created_at: r.created_at }));
}

/** Students enrolled in the matching past-term sections, for response rates. */
function enrolledIn(where: string, ...params: unknown[]) {
  const enrolled = db().get<{ n: number }>(`SELECT SUM(enrolled) AS n FROM course_sections WHERE term IN (${PUBLIC_TERMS.map(() => '?').join(',')}) AND ${where}`, ...PUBLIC_TERMS, ...params)?.n ?? 0;
  return enrolled;
}

// ------------------------------------------------------------------ public KPI pages
router.get('/overview', h((req, res) => {
  const u = requireUser(req);
  const rows = publicRows();
  const mine = hasRole(u, 'student') ? eligibleFor(u) : [];
  const recent = db().all('SELECT * FROM feedback_actions ORDER BY created_at DESC LIMIT 3').map((r) => ({ ...r, ...(r.course_code ? courseTitle(r.course_code as string) : {}) }));
  ok(res, {
    windows: [windowState('end_of_term'), windowState('mid_term')],
    me: { pending: mine.filter((m) => m.status === 'pending').length, submitted: mine.filter((m) => m.status === 'submitted').length },
    totals: { responses: rows.length, courses: new Set(rows.map((r) => r.course_code)).size, instructors: new Set(rows.map((r) => r.instructor)).size },
    overall: aggregate(rows, TEACHING_KPIS),
    min_responses: MIN_RESPONSES,
    public_terms: PUBLIC_TERMS.map((t) => ({ term: t, ...termLabelOf(t) })),
    colleges: COLLEGES.map((c) => ({ key: c.key, en: c.en, ar: c.ar })),
    actions: recent,
    is_staff: isStaff(u)
  });
}));

router.get('/instructors', h((req, res) => {
  requireUser(req);
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const college = String(req.query.college ?? '');
  const rows = publicRows();
  const items = allInstructors().map((name) => {
    const mine = rows.filter((r) => r.instructor === name);
    const a = aggregate(mine, TEACHING_KPIS);
    const last = aggregate(mine.filter((r) => r.term === PUBLIC_TERMS[2]), TEACHING_KPIS).index;
    const prev = aggregate(mine.filter((r) => r.term === PUBLIC_TERMS[1]), TEACHING_KPIS).index;
    return {
      ...instructorView(name), college: instructorCollege(mine), courses: [...new Set(mine.map((r) => r.course_code))].sort(),
      n: a.n, enough: a.enough, index: a.index, recommend: a.recommend,
      kpis: Object.fromEntries(TEACHING_KPIS.map((k) => [k, { mean: a.kpis[k].mean, band: a.kpis[k].band }])),
      delta: last !== null && prev !== null ? last - prev : null
    };
  }).filter((i) => (!college || i.college === college) && (!q || i.name_en.toLowerCase().includes(q) || i.name_ar.includes(q) || i.courses.some((c) => c.toLowerCase().replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))));
  items.sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || a.name_en.localeCompare(b.name_en));
  ok(res, { items, min_responses: MIN_RESPONSES });
}));

router.get('/instructors/:slug', h((req, res) => {
  requireUser(req);
  const name = instructorBySlug(req.params.slug as string);
  const rows = publicRows('instructor = ?', name);
  const a = aggregate(rows, TEACHING_KPIS);
  const college = instructorCollege(rows);
  const bench = collegeBenchmark(college, 'instructor');
  const courses = [...new Set(rows.map((r) => r.course_code))].sort().map((code) => {
    const c = aggregate(rows.filter((r) => r.course_code === code), TEACHING_KPIS);
    return { code, ...courseTitle(code), n: c.n, enough: c.enough, index: c.index, terms: [...new Set(rows.filter((r) => r.course_code === code).map((r) => r.term))] };
  });
  const enrolled = enrolledIn('instructor = ?', name);
  ok(res, {
    ...instructorView(name), college,
    aggregate: a,
    benchmark: bench,
    trend: trend(rows, TEACHING_KPIS),
    courses,
    actions: actionsFor({ instructor: name }),
    response_rate: enrolled ? Math.round((rows.length / enrolled) * 100) : null,
    kpis: TEACHING_KPIS,
    min_responses: MIN_RESPONSES
  });
}));

router.get('/courses', h((req, res) => {
  requireUser(req);
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const college = String(req.query.college ?? '');
  const rows = publicRows();
  const items = [...new Set(rows.map((r) => r.course_code))].map((code) => {
    const mine = rows.filter((r) => r.course_code === code);
    const a = aggregate(mine);
    return {
      code, ...courseTitle(code), college: collegeOf(code), instructors: [...new Set(mine.map((r) => r.instructor))].map(instructorView),
      n: a.n, enough: a.enough, index: a.index, hours: a.hours, recommend: a.recommend,
      kpis: Object.fromEntries(ALL_KPIS.map((k) => [k, { mean: a.kpis[k].mean, band: a.kpis[k].band }]))
    };
  }).filter((c) => (!college || c.college === college) && (!q || c.code.toLowerCase().replace(/\s+/g, '').includes(q.replace(/\s+/g, '')) || c.title_en.toLowerCase().includes(q) || c.title_ar.includes(q)));
  items.sort((a, b) => a.code.localeCompare(b.code));
  ok(res, { items, min_responses: MIN_RESPONSES });
}));

router.get('/courses/:code', h((req, res) => {
  const u = requireUser(req);
  const code = String(req.params.code).toUpperCase().replace(/^([A-Z]+)\s*(\d+)$/, '$1 $2');
  const rows = publicRows('course_code = ?', code);
  if (!rows.length && !db().get('SELECT 1 FROM courses WHERE code = ?', code)) throw notFound('Course not found');
  const a = aggregate(rows);
  const bench = collegeBenchmark(collegeOf(code), 'course');
  const byInstructor = [...new Set(rows.map((r) => r.instructor))].map((name) => {
    const x = aggregate(rows.filter((r) => r.instructor === name), TEACHING_KPIS);
    return { ...instructorView(name), n: x.n, enough: x.enough, index: x.index, kpis: Object.fromEntries(TEACHING_KPIS.map((k) => [k, x.kpis[k].mean])), terms: [...new Set(rows.filter((r) => r.instructor === name).map((r) => r.term))] };
  });
  const enrolled = enrolledIn('course_code = ?', code);
  const mine = hasRole(u, 'student') ? eligibleFor(u).filter((m) => m.course_code === code) : [];
  ok(res, {
    code, ...courseTitle(code), college: collegeOf(code),
    aggregate: a, benchmark: bench, trend: trend(rows, ALL_KPIS),
    by_instructor: byInstructor,
    actions: actionsFor({ course: code }),
    response_rate: enrolled ? Math.round((rows.length / enrolled) * 100) : null,
    kpis: ALL_KPIS,
    mine,
    min_responses: MIN_RESPONSES
  });
}));

// ------------------------------------------------------------------ giving feedback
interface Eligible { course_code: string; title_en: string; title_ar: string; term: string; term_label_en: string; term_label_ar: string; instructor: ReturnType<typeof instructorView>; section_id: string | null; phase: Phase; status: 'pending' | 'submitted' | 'closed'; response_id: string | null; closes_on: string }

/** Courses the student can rate: completed in the end-of-term window's term, or in progress this term. */
function eligibleFor(u: User): Eligible[] {
  const out: Eligible[] = [];
  const add = (course: string, term: string, phase: Phase, sectionId: string | null) => {
    const sec = sectionId
      ? db().get<{ id: string; instructor: string }>('SELECT id, instructor FROM course_sections WHERE id = ?', sectionId)
      : db().get<{ id: string; instructor: string }>('SELECT id, instructor FROM course_sections WHERE term = ? AND course_code = ? ORDER BY CASE campus_id WHEN ? THEN 0 ELSE 1 END, section_no LIMIT 1', term, course, u.campus_id);
    if (!sec) return;
    const w = windowState(phase);
    const mine = db().get<{ id: string }>('SELECT id FROM course_feedback WHERE student_id = ? AND course_code = ? AND term = ?', u.id, course, term);
    const label = termLabelOf(term);
    out.push({ course_code: course, ...courseTitle(course), term, term_label_en: label.en, term_label_ar: label.ar, instructor: instructorView(sec.instructor), section_id: sec.id, phase, status: mine ? 'submitted' : w.open ? 'pending' : 'closed', response_id: mine?.id ?? null, closes_on: w.closes_on });
  };
  for (const t of db().all<{ course_code: string; section_id: string | null }>("SELECT course_code, section_id FROM transcript_entries WHERE student_id = ? AND term = ? AND status = 'completed' ORDER BY course_code", u.id, END_TERM)) add(t.course_code, END_TERM, 'end_of_term', t.section_id);
  for (const t of db().all<{ course_code: string; section_id: string | null }>("SELECT course_code, section_id FROM transcript_entries WHERE student_id = ? AND term = ? AND status = 'enrolled' ORDER BY course_code", u.id, CURRENT_TERM)) add(t.course_code, CURRENT_TERM, 'mid_term', t.section_id);
  return out;
}

router.get('/mine', h((req, res) => {
  const u = requireUser(req);
  const items = hasRole(u, 'student') ? eligibleFor(u) : [];
  const responses = db().all<Stored>('SELECT * FROM course_feedback WHERE student_id = ? ORDER BY updated_at DESC', u.id).map((r) => ({
    id: r.id, course_code: r.course_code, ...courseTitle(r.course_code), term: r.term, phase: r.phase, instructor: instructorView(r.instructor), status: r.status,
    ratings: pj(r.ratings, {}), recommend: r.recommend, hours_per_week: r.hours_per_week, comment: r.comment, themes: pj(r.themes, []), created_at: r.created_at, updated_at: r.updated_at,
    editable: windowState(r.phase as Phase).open
  }));
  ok(res, { windows: [windowState('end_of_term'), windowState('mid_term')], items, responses, min_responses: MIN_RESPONSES });
}));

const rating = z.number().int().min(1).max(5);
const responseBody = z.object({
  ratings: z.object({ clarity: rating, grading: rating, support: rating, organisation: rating, workload: rating, value: rating }),
  recommend: z.boolean().nullable().optional(),
  hours_per_week: z.number().int().min(0).max(40).nullable().optional(),
  comment: z.string().trim().max(650).optional()
});

function screenComment(comment: string) {
  if (comment && comment.length < 10) throw unprocessable('Comments need at least 10 characters, or leave the box empty.');
  const c = checkText(comment);
  if (c.blocking) {
    throw unprocessable(c.flags.includes('abusive')
      ? 'Please describe the teaching, not the person: the comment contains language that breaks the feedback guidelines.'
      : 'Please remove names, phone numbers, emails or student numbers so your feedback stays anonymous.', { flags: c.flags });
  }
  return c;
}

router.post('/responses', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'student')) throw forbidden('Only students give course feedback');
  const body = parse(responseBody.extend({ course_code: z.string(), term: z.string() }), req.body);
  const e = eligibleFor(u).find((x) => x.course_code === body.course_code && x.term === body.term);
  if (!e) throw forbidden('You can only rate courses on your own record in an open feedback window');
  if (e.status === 'submitted') throw conflict('You already rated this course. Edit your response instead.');
  if (e.status === 'closed') throw conflict('The feedback window for this term has closed.');
  const comment = body.comment ?? '';
  const check = screenComment(comment);
  const id = newId('fb');
  const at = nowIso();
  const status = check.flags.length ? 'held' : 'published';
  db().tx(() => {
    db().insert('course_feedback', {
      id, student_id: u.id, course_code: e.course_code, term: e.term, section_id: e.section_id, instructor: e.instructor.name_en, phase: e.phase,
      ratings: j(body.ratings), recommend: body.recommend === undefined || body.recommend === null ? null : body.recommend ? 1 : 0, hours_per_week: body.hours_per_week ?? null,
      comment, themes: j(classifyComment(comment)), status, flags: j(check.flags), created_at: at, updated_at: at
    });
    audit(null, 'feedback.submit', 'course_feedback', id, { course: e.course_code, term: e.term, status });
  });
  ok(res, { id, status, themes: classifyComment(comment) }, 201);
}));

function ownResponse(u: User, id: string): Stored {
  const r = db().get<Stored>('SELECT * FROM course_feedback WHERE id = ? AND student_id = ?', id, u.id);
  if (!r) throw notFound('Response not found');
  if (!windowState(r.phase as Phase).open) throw conflict('The feedback window for this term has closed.');
  return r;
}

router.put('/responses/:id', h((req, res) => {
  const u = requireUser(req);
  const r = ownResponse(u, req.params.id as string);
  const body = parse(responseBody, req.body);
  const comment = body.comment ?? '';
  const check = screenComment(comment);
  const status = check.flags.length ? 'held' : 'published';
  db().update('course_feedback', r.id, { ratings: j(body.ratings), recommend: body.recommend === undefined || body.recommend === null ? null : body.recommend ? 1 : 0, hours_per_week: body.hours_per_week ?? null, comment, themes: j(classifyComment(comment)), status, flags: j(check.flags), updated_at: nowIso() });
  ok(res, { id: r.id, status });
}));

router.delete('/responses/:id', h((req, res) => {
  const u = requireUser(req);
  const r = ownResponse(u, req.params.id as string);
  db().run('DELETE FROM course_feedback WHERE id = ?', r.id);
  ok(res, { id: r.id, withdrawn: true });
}));

// ------------------------------------------------------------------ help desk
const ticketView = (t: Record<string, unknown>) => ({ id: t.id, public_id: t.public_id, category: t.category, subject: t.subject, body: t.body, page: t.page, status: t.status, reply: t.reply, replied_at: t.replied_at, created_at: t.created_at });

router.get('/help/tickets', h((req, res) => {
  const u = requireUser(req);
  ok(res, db().all('SELECT * FROM help_tickets WHERE user_id = ? ORDER BY created_at DESC, rowid DESC', u.id).map(ticketView));
}));

router.post('/help/tickets', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ category: z.enum(['bug', 'suggestion', 'question', 'account', 'other']), subject: z.string().trim().min(4).max(120), body: z.string().trim().min(10).max(2000), page: z.string().max(200).optional() }), req.body);
  const c = checkText(`${body.subject}\n${body.body}`);
  if (c.flags.includes('abusive')) throw unprocessable('Please rephrase the message without abusive language.');
  const id = newId('hlp');
  const publicId = `HLP-${2000 + db().count('help_tickets') + 60}`;
  db().tx(() => {
    db().insert('help_tickets', { id, public_id: publicId, user_id: u.id, category: body.category, subject: body.subject, body: body.body, page: body.page ?? null, status: 'open', reply: null, replied_by: null, replied_at: null, created_at: nowIso() });
    for (const s of db().all<{ id: string }>("SELECT id FROM users WHERE roles LIKE '%reviewer%'")) notify(s.id, { module: 'feedback', kind: 'help_ticket', title: `Help request ${publicId}`, body: body.subject, link: '/staff/feedback?tab=help' });
    audit(u.id, 'help.ticket.create', 'help_ticket', id, { category: body.category });
  });
  ok(res, ticketView(db().get('SELECT * FROM help_tickets WHERE id = ?', id)!), 201);
}));

// ------------------------------------------------------------------ quality office
router.get('/staff/overview', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  const rows = publicRows();
  // Alerts: instructor x KPI below 3.6 with enough responses, compared to their college.
  const alerts = allInstructors().flatMap((name) => {
    const mine = rows.filter((r) => r.instructor === name);
    const a = aggregate(mine, TEACHING_KPIS);
    const bench = collegeBenchmark(instructorCollege(mine), 'instructor');
    return TEACHING_KPIS.filter((k) => a.kpis[k].band === 'focus').map((k) => ({ ...instructorView(name), kpi: k, mean: a.kpis[k].mean, college_mean: bench[k], n: a.kpis[k].n, has_action: !!db().get('SELECT 1 FROM feedback_actions WHERE instructor = ? AND kpi = ?', name, k) }));
  });
  const courseAlerts = [...new Set(rows.map((r) => r.course_code))].flatMap((code) => {
    const a = aggregate(rows.filter((r) => r.course_code === code));
    return COURSE_KPIS.filter((k) => a.kpis[k].band === 'focus').map((k) => ({ code, ...courseTitle(code), kpi: k, mean: a.kpis[k].mean, n: a.kpis[k].n, has_action: !!db().get('SELECT 1 FROM feedback_actions WHERE course_code = ? AND kpi = ?', code, k) }));
  });
  const mid = db().all<Stored>("SELECT * FROM course_feedback WHERE phase = 'mid_term' AND status = 'published' AND term = ?", CURRENT_TERM).map(toRow);
  const pulse = [...new Set(mid.map((r) => `${r.course_code}|${r.instructor}`))].map((key) => {
    const [code, name] = key.split('|');
    const a = aggregate(mid.filter((r) => r.course_code === code && r.instructor === name), TEACHING_KPIS);
    return { code, ...courseTitle(code), instructor: instructorView(name), n: a.n, enough: a.enough, index: a.index };
  });
  const byCollege = COLLEGES.map((c) => {
    const n = rows.filter((r) => collegeOf(r.course_code) === c.key).length;
    const enrolled = db().all<{ course_code: string; enrolled: number }>(`SELECT course_code, enrolled FROM course_sections WHERE status = 'closed' AND term IN (${PUBLIC_TERMS.map(() => '?').join(',')})`, ...PUBLIC_TERMS).filter((s) => collegeOf(s.course_code) === c.key).reduce((acc, s) => acc + s.enrolled, 0);
    return { key: c.key, en: c.en, ar: c.ar, responses: n, response_rate: enrolled ? Math.round((n / enrolled) * 100) : null, index: aggregate(rows.filter((r) => collegeOf(r.course_code) === c.key), TEACHING_KPIS).index };
  }).filter((c) => c.responses > 0);
  ok(res, {
    alerts, course_alerts: courseAlerts, pulse, by_college: byCollege,
    held: db().count('course_feedback', "status = 'held'"),
    tickets_open: db().count('help_tickets', "status = 'open'"),
    actions: db().all('SELECT * FROM feedback_actions ORDER BY created_at DESC')
  });
}));

/** Personal data is masked even for staff: the office judges tone, not who wrote it. */
const redact = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/(?:\+?966|\b0)5\d(?:[\s-]?\d){7}\b/g, '[phone]').replace(/\b20\d{7}\b/g, '[student no.]');

router.get('/staff/held', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  ok(res, db().all<Stored>("SELECT * FROM course_feedback WHERE status = 'held' ORDER BY updated_at DESC").map((r) => ({
    id: r.id, course_code: r.course_code, ...courseTitle(r.course_code), term: r.term, instructor: instructorView(r.instructor), phase: r.phase,
    ratings: pj(r.ratings, {}), comment: redact(r.comment), flags: pj(r.flags, []), themes: pj(r.themes, []), updated_at: r.updated_at
  })));
}));

router.post('/staff/held/:id', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  const body = parse(z.object({ decision: z.enum(['publish', 'reject']) }), req.body);
  const r = db().get<Stored>("SELECT * FROM course_feedback WHERE id = ? AND status = 'held'", req.params.id as string);
  if (!r) throw notFound('Held response not found');
  db().update('course_feedback', r.id, { status: body.decision === 'publish' ? 'published' : 'rejected', updated_at: nowIso() });
  audit(u.id, `feedback.${body.decision}`, 'course_feedback', r.id, {});
  ok(res, { id: r.id, status: body.decision === 'publish' ? 'published' : 'rejected' });
}));

router.post('/staff/actions', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  const body = parse(z.object({ course_code: z.string().optional(), instructor_slug: z.string().optional(), kpi: z.enum(ALL_KPIS as [KpiKey, ...KpiKey[]]), body_en: z.string().trim().min(10).max(400), body_ar: z.string().trim().max(400).optional() }).refine((b) => b.course_code || b.instructor_slug, 'Choose a course or an instructor'), req.body);
  const instructor = body.instructor_slug ? instructorBySlug(body.instructor_slug) : null;
  const id = newId('fba');
  db().tx(() => {
    db().insert('feedback_actions', { id, course_code: body.course_code ?? null, instructor, kpi: body.kpi, body_en: body.body_en, body_ar: body.body_ar ?? '', author_id: u.id, created_at: nowIso() });
    // Close the loop with everyone who gave feedback on it, without revealing who they are to anyone.
    const students = db().all<{ student_id: string }>(`SELECT DISTINCT student_id FROM course_feedback WHERE ${body.course_code ? 'course_code = ?' : 'instructor = ?'}`, body.course_code ?? instructor);
    const link = body.course_code ? `/feedback/courses/${encodeURIComponent(body.course_code)}` : `/feedback/instructors/${body.instructor_slug}`;
    for (const s of students) notify(s.student_id, { module: 'feedback', kind: 'feedback_action', title: `You said, we did: ${body.course_code ?? instructor}`, body: body.body_en.slice(0, 140), link });
    audit(u.id, 'feedback.action', 'feedback_action', id, { kpi: body.kpi });
  });
  ok(res, db().get('SELECT * FROM feedback_actions WHERE id = ?', id), 201);
}));

router.get('/staff/tickets', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  ok(res, db().all("SELECT t.*, u.name_en, u.name_ar FROM help_tickets t JOIN users u ON u.id = t.user_id ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC").map((t) => ({ ...ticketView(t), requester: { name_en: t.name_en, name_ar: t.name_ar } })));
}));

router.post('/staff/tickets/:id/reply', h((req, res) => {
  const u = requireUser(req);
  requireStaff(u);
  const body = parse(z.object({ reply: z.string().trim().min(5).max(2000), close: z.boolean().optional() }), req.body);
  const t = db().get('SELECT * FROM help_tickets WHERE id = ?', req.params.id as string);
  if (!t) throw notFound('Ticket not found');
  db().tx(() => {
    db().update('help_tickets', t.id as string, { reply: body.reply, replied_by: u.id, replied_at: nowIso(), status: body.close ? 'closed' : 'answered' });
    notify(t.user_id as string, { module: 'feedback', kind: 'help_reply', title: `Reply to ${t.public_id}`, body: body.reply.slice(0, 140), link: '/feedback?tab=help' });
    audit(u.id, 'help.ticket.reply', 'help_ticket', t.id as string, {});
  });
  ok(res, ticketView(db().get('SELECT * FROM help_tickets WHERE id = ?', t.id as string)!));
}));

export const feedbackModule: AppModule = {
  name: 'feedback',
  router,
  seed: seedFeedback
};
