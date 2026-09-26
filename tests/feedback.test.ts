import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { aggregate, classifyComment, MIN_RESPONSES, type FeedbackRow } from '../server/modules/feedback/kpi.ts';

interface KpiStat { mean: number | null; favourable: number | null; band: string | null; n: number }
interface Agg { n: number; enough: boolean; index: number | null; kpis: Record<string, KpiStat>; strengths: Array<{ key: string; share: number }>; suggestions: Array<{ key: string; share: number }> }
interface Eligible { course_code: string; term: string; phase: string; status: string; response_id: string | null }
const ratings = { clarity: 4, grading: 3, support: 5, organisation: 4, workload: 2, value: 5 };

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('KPI aggregation', () => {
  it('withholds every number below the minimum number of responses', () => {
    const row = (v: number): FeedbackRow => ({ course_code: 'X 1', term: 't', instructor: 'i', ratings: { clarity: v, grading: v, support: v, organisation: v, workload: v, value: v }, recommend: 1, hours_per_week: 5, themes: [{ key: 'examples', tone: 'strength' }] });
    const few = aggregate([row(5), row(1), row(3), row(4)]);
    expect(few.enough).toBe(false);
    expect(few.index).toBeNull();
    expect(few.kpis.clarity.mean).toBeNull();
    expect(few.strengths).toEqual([]);
    const enough = aggregate([row(5), row(4), row(4), row(3), row(5)]);
    expect(enough.kpis.clarity).toMatchObject({ mean: 4.2, favourable: 80, band: 'strong' });
    expect(enough.index).toBe(80);
    expect(MIN_RESPONSES).toBe(5);
  });

  it('turns comments into strengths and suggestions in English and Arabic', () => {
    expect(classifyComment('Great worked examples in every lecture. Marks back were late after the midterm.')).toEqual([{ key: 'examples', tone: 'strength' }, { key: 'feedback_speed', tone: 'suggestion' }]);
    expect(classifyComment('المحاضرات تفاعلية وممتعة. الواجبات كثيرة في نفس الأسبوع.')).toEqual([{ key: 'engagement', tone: 'strength' }, { key: 'workload', tone: 'suggestion' }]);
    expect(classifyComment('صعب التواصل خارج الساعات المكتبية.')).toEqual([{ key: 'availability', tone: 'suggestion' }]);
  });
});

describe('public KPI pages', () => {
  it('never exposes comments or who responded', async () => {
    const c = await s.as('u_student').get<{ aggregate: Agg; by_instructor: unknown[]; trend: Array<{ term: string; kpis: Record<string, number | null> }> }>('/feedback/courses/CIS%20321');
    expect(c.status).toBe(200);
    expect(c.body.data!.aggregate.enough).toBe(true);
    const text = JSON.stringify(c.body.data);
    expect(text).not.toContain('student_id');
    expect(text).not.toContain('u_m_');
    expect(text).not.toMatch(/worked examples in every lecture/);
    // The department's rubric action shows up as a rising grading KPI.
    const grading = c.body.data!.trend.map((t) => t.kpis.grading).filter((x): x is number => x !== null);
    expect(grading[grading.length - 1]).toBeGreaterThan(grading[0]);
  });

  it('hides KPIs for a course-term below the threshold but still counts the responses', async () => {
    const c = await s.as('u_student').get<{ trend: Array<{ term: string; n: number; index: number | null }> }>('/feedback/courses/CIS%20386');
    const spring25 = c.body.data!.trend.find((t) => t.term === '2024-2')!;
    expect(spring25.n).toBeLessThan(MIN_RESPONSES);
    expect(spring25.index).toBeNull();
  });

  it('lists instructors with a teaching index and filters by college and search', async () => {
    const all = await s.as('u_student').get<{ items: Array<{ slug: string; college: string; index: number | null; courses: string[] }> }>('/feedback/instructors');
    expect(all.body.data!.items.length).toBeGreaterThan(5);
    const law = await s.as('u_student').get<{ items: unknown[] }>('/feedback/instructors?college=law');
    expect(law.body.data!.items).toHaveLength(0);
    const q = await s.as('u_student').get<{ items: Array<{ courses: string[] }> }>('/feedback/instructors?q=cis321');
    expect(q.body.data!.items.every((i) => i.courses.includes('CIS 321'))).toBe(true);
    const first = all.body.data!.items[0];
    const p = await s.as('u_student').get<{ aggregate: Agg; benchmark: Record<string, number | null>; courses: unknown[] }>(`/feedback/instructors/${first.slug}`);
    expect(p.body.data!.aggregate.index).not.toBeNull();
    expect(p.body.data!.benchmark.clarity).not.toBeNull();
  });
});

describe('giving feedback', () => {
  it('offers Spring courses at end of term and current courses as a mid-term check-in', async () => {
    const r = await s.as('u_student').get<{ items: Eligible[] }>('/feedback/mine');
    const items = r.body.data!.items;
    expect(items.find((i) => i.course_code === 'SWE 300')!.status).toBe('submitted');
    expect(items.find((i) => i.course_code === 'CIS 304')).toMatchObject({ phase: 'end_of_term', status: 'pending' });
    expect(items.find((i) => i.course_code === 'CIS 321')).toMatchObject({ phase: 'mid_term', status: 'pending' });
  });

  it('accepts one anonymous response per course, refuses courses not on the record and abusive text', async () => {
    const sara = s.as('u_student');
    expect((await sara.post('/feedback/responses', { course_code: 'CIS 443', term: '2026-1', ratings })).status).toBe(403);
    expect((await sara.post('/feedback/responses', { course_code: 'CIS 304', term: '2025-2', ratings, comment: 'The doctor is stupid' })).status).toBe(422);
    expect((await sara.post('/feedback/responses', { course_code: 'CIS 304', term: '2025-2', ratings, comment: 'Email me at sara@example.org' })).status).toBe(422);
    const ok = await sara.post<{ id: string; status: string; themes: Array<{ key: string }> }>('/feedback/responses', { course_code: 'CIS 304', term: '2025-2', ratings, recommend: true, hours_per_week: 6, comment: 'Great worked examples in every lecture. Too many assignments in the same week.' });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.status).toBe('published');
    expect(ok.body.data!.themes.map((t) => t.key)).toEqual(['examples', 'workload']);
    expect((await sara.post('/feedback/responses', { course_code: 'CIS 304', term: '2025-2', ratings })).status).toBe(409);
    expect(db().count('audit_events', "action = 'feedback.submit' AND actor_id IS NOT NULL")).toBe(0);
    // Another student cannot touch it.
    expect((await s.as('u_lead').put(`/feedback/responses/${ok.body.data!.id}`, { ratings })).status).toBe(404);
    const edit = await sara.put<{ status: string }>(`/feedback/responses/${ok.body.data!.id}`, { ratings: { ...ratings, grading: 4 } });
    expect(edit.status).toBe(200);
  });

  it('holds all-caps or link-heavy comments for the quality office', async () => {
    const r = await s.as('u_student').post<{ status: string }>('/feedback/responses', { course_code: 'CIS 321', term: '2026-1', ratings, comment: 'THE LABS ARE GREAT BUT THE ROOM IS ALWAYS FREEZING COLD' });
    expect(r.body.data!.status).toBe('held');
  });
});

describe('quality office and help desk', () => {
  it('staff review held responses (masked) and close the loop with a department action', async () => {
    expect((await s.as('u_student').get('/feedback/staff/held')).status).toBe(403);
    const staff = s.as('u_reviewer');
    const held = await staff.get<Array<{ id: string; comment: string }>>('/feedback/staff/held');
    expect(held.body.data!.length).toBeGreaterThanOrEqual(3);
    const pub = await staff.post<{ status: string }>(`/feedback/staff/held/${held.body.data![0].id}`, { decision: 'publish' });
    expect(pub.body.data!.status).toBe('published');
    const overview = await staff.get<{ alerts: Array<{ slug: string; kpi: string }>; by_college: unknown[] }>('/feedback/staff/overview');
    expect(overview.body.data!.by_college.length).toBeGreaterThan(0);
    const before = db().count('notifications', "kind = 'feedback_action' AND user_id = 'u_student'");
    const a = await staff.post('/feedback/staff/actions', { course_code: 'SWE 300', kpi: 'clarity', body_en: 'Weekly worked-example sheets now go out every Sunday.' });
    expect(a.status).toBe(201);
    expect(db().count('notifications', "kind = 'feedback_action' AND user_id = 'u_student'")).toBe(before + 1);
  });

  it('students open help tickets and see staff replies', async () => {
    const t = await s.as('u_student').post<{ id: string; public_id: string; status: string }>('/feedback/help/tickets', { category: 'bug', subject: 'Map does not load', body: 'The campus map stays grey on my phone.', page: '/campus/map' });
    expect(t.status).toBe(201);
    expect(t.body.data!.public_id).toMatch(/^HLP-\d+$/);
    const r = await s.as('u_reviewer').post<{ status: string }>(`/feedback/staff/tickets/${t.body.data!.id}/reply`, { reply: 'Fixed in today’s update; please reload.' });
    expect(r.body.data!.status).toBe('answered');
    const mine = await s.as('u_student').get<Array<{ id: string; reply: string | null }>>('/feedback/help/tickets');
    expect(mine.body.data!.find((x) => x.id === t.body.data!.id)!.reply).toContain('reload');
  });
});
