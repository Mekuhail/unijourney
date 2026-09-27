import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { registeredMigrations, runMigrations } from '../server/core/migrations.ts';
import { setSetting } from '../server/core/settings.ts';
import { parseAnnouncement, parseQuickLine, parseTimes } from '../server/modules/academics/assessments.ts';

interface Item { id: string; title: string; description: string; course_code: string | null; kind: string; assessment_kind: string | null; date: string | null; due_at: string | null; start_at: string | null; end_at: string | null; remind_at: string | null; urgency: string; done: boolean; source: string; location_text: string | null; email: { id: string; from_name: string; subject: string } | null; overdue: boolean; editable: boolean; cancelled: boolean }
interface Planner { today: string; items: Item[]; busy: Array<{ kind: string; title: string }>; courses: string[]; emails: Array<{ id: string; subject: string; scheduled: boolean; note: string | null }> }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

const local = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);

describe('announcement parsing', () => {
  it('reads kind, number, date, time and room from an English email', () => {
    const p = parseAnnouncement('Quiz 2 on Tuesday 6 October', 'Quiz 2 will be held on Tuesday 6 October at 11:00 in E203. It covers chapters 4 and 5.', '2026-09-27')!;
    expect(p).toMatchObject({ kind: 'quiz', number: 2, date: '2026-10-06', start: '11:00', room: 'E203', moved: false });
    const m = parseAnnouncement('Midterm exam', 'The midterm exam is on Thursday 8 October from 4:00 to 5:30 pm in G105. It covers lectures 1 to 6.', '2026-09-27')!;
    expect(m).toMatchObject({ kind: 'midterm', date: '2026-10-08', start: '16:00', end: '17:30', room: 'G105' });
  });

  it('reads Arabic announcements (day and month names, Arabic digits, مساءً)', () => {
    const p = parseAnnouncement('موعد تسليم تقرير المعمل 3', 'آخر موعد لتسليم تقرير المعمل رقم ٣ هو يوم الأحد ٤ أكتوبر الساعة 10 مساءً.', '2026-09-27')!;
    expect(p).toMatchObject({ kind: 'lab', number: 3, date: '2026-10-04', start: '22:00' });
    const q = parseAnnouncement('اختبار قصير رقم 2', 'سيكون الاختبار القصير رقم 2 يوم الخميس 1 أكتوبر الساعة 10 صباحًا في القاعة E-205.', '2026-09-27')!;
    expect(q).toMatchObject({ kind: 'quiz', number: 2, date: '2026-10-01', start: '10:00', room: 'E205' });
    expect(parseAnnouncement('الاختبار القصير 3 الأسبوع القادم', 'سيكون الاختبار القصير رقم 3 يوم الأربعاء 7 أكتوبر الساعة 11 صباحًا في القاعة E203.', '2026-09-27')).toMatchObject({ kind: 'quiz', number: 3, date: '2026-10-07', start: '11:00', room: 'E203' });
  });

  it('ignores messages that announce nothing, and understands deadlines and times', () => {
    expect(parseAnnouncement('Office hours this week', 'Office hours move to Monday 12:30 in my office.', '2026-09-27')).toBeNull();
    expect(parseTimes('due by 11:59 pm').start).toBe('23:59');
    expect(parseTimes('at 2').start).toBe('14:00');
    expect(parseTimes('from 9:30 to 10:45').end).toBe('10:45');
  });

  it('turns one line into a task or a reminder', () => {
    const known = new Set(['CIS 321']);
    expect(parseQuickLine('Revise CIS 321 ch 5 tomorrow 7pm', known, '2026-09-27')).toMatchObject({ title: 'Revise CIS 321 ch 5', date: '2026-09-28', time: '19:00', course_code: 'CIS 321', kind: 'task' });
    expect(parseQuickLine('remind me to email Dr. Hala on Sunday at 9am', known, '2026-09-27')).toMatchObject({ kind: 'reminder', date: '2026-09-27', time: '09:00' });
  });
});

describe('professor emails fill the planner', () => {
  it('seeds each enrolled student with the professor’s exact title and description', async () => {
    const r = await s.as('u_student').get<Planner>('/academics/planner');
    expect(r.status).toBe(200);
    const d = r.body.data!;
    const quiz = d.items.find((i) => i.assessment_kind === 'quiz' && i.course_code === 'CIS 321')!;
    expect(quiz.title).toBe('Quiz 2 on Tuesday 6 October');
    expect(quiz.description).toContain('It covers chapters 4 and 5');
    expect(local(quiz.start_at!)).toBe('2026-10-06 11:00');
    expect(local(quiz.end_at!)).toBe('2026-10-06 11:30');
    expect(quiz.location_text).toBe('E203 Classroom');
    expect(quiz.email?.from_name).toBe('Dr. Khalid Al-Shammari');
    expect(quiz.editable).toBe(false);
    const lab = d.items.find((i) => i.assessment_kind === 'lab')!;
    expect(lab.title).toBe('موعد تسليم تقرير المعمل 3');
    expect(local(lab.due_at!)).toBe('2026-10-04 22:00');
    expect(d.items.filter((i) => i.kind === 'assessment').map((i) => i.course_code).sort()).toEqual(['CIS 316', 'CIS 321', 'SWE 302', 'SWE 312', 'SWE 322']);
    expect(d.emails.find((e) => e.subject === 'Office hours this week')!.scheduled).toBe(false);
    // Not someone else's course.
    expect(d.items.some((i) => i.course_code === 'SWE 411')).toBe(false);
    const cal = db().all<{ kind: string; start_at: string }>("SELECT kind, start_at FROM calendar_entries WHERE owner_id = 'u_student' AND source_type = 'assessment' ORDER BY start_at");
    expect(cal.length).toBe(5);
    expect(cal.some((c) => c.kind === 'exam' && c.start_at === '2026-10-06T11:00:00+03:00')).toBe(true);
    const layan = (await s.as('u_lead').get<Planner>('/academics/planner')).body.data!;
    expect(layan.items.find((i) => i.course_code === 'SWE 411')?.title).toBe('Quiz 1 next Wednesday');
    const faisal = (await s.as('u_student2').get<Planner>('/academics/planner')).body.data!;
    expect(faisal.items.find((i) => i.course_code === 'CIS 202')?.location_text).toBe('E-205 Classroom');
  });

  it('a new announcement reaches every enrolled student, and a follow-up moves it instead of duplicating', async () => {
    const before = db().count('notifications', "user_id = 'u_student'");
    const r = await s.as('u_reviewer').post<{ scheduled: boolean; recipients: number }>('/academics/planner/demo/email', { course_code: 'SWE 302', subject: 'Quiz 1: architectural styles', body: 'Quiz 1 is on Wednesday 7 October at 9:30 in E101. Bring a pencil.' });
    expect(r.status).toBe(201);
    expect(r.body.data!.scheduled).toBe(true);
    expect(r.body.data!.recipients).toBeGreaterThanOrEqual(1);
    expect(db().count('notifications', "user_id = 'u_student'")).toBe(before + 1);
    let quiz = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!.items.find((i) => i.title === 'Quiz 1: architectural styles')!;
    expect(local(quiz.start_at!)).toBe('2026-10-07 09:30');

    await s.as('u_reviewer').post('/academics/planner/demo/email', { course_code: 'SWE 302', subject: 'Quiz 1 moved', body: 'Quiz 1 has been moved to Thursday 8 October at 9:30 because of the career fair.' });
    const items = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!.items.filter((i) => i.course_code === 'SWE 302' && i.assessment_kind === 'quiz');
    expect(items.length).toBe(1);
    quiz = items[0];
    expect(local(quiz.start_at!)).toBe('2026-10-08 09:30');
    expect(quiz.description).toContain('moved to Thursday 8 October');

    await s.as('u_reviewer').post('/academics/planner/demo/email', { course_code: 'SWE 302', subject: 'Quiz 1 cancelled', body: 'Quiz 1 is cancelled; its weight moves to the final exam.' });
    const gone = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!.items.find((i) => i.id === quiz.id)!;
    expect(gone.cancelled).toBe(true);
    expect(db().count('calendar_entries', "owner_id = 'u_student' AND source_type = 'assessment' AND title LIKE '%Quiz 1%'")).toBe(0);
  });

  it('students can mark an assessment done but not edit or delete it', async () => {
    const quiz = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!.items.find((i) => i.title === 'Quiz 2 on Tuesday 6 October')!;
    expect((await s.as('u_student').patch(`/academics/planner/items/${quiz.id}`, { title: 'Easy quiz' })).status).toBe(403);
    expect((await s.as('u_student').del(`/academics/planner/items/${quiz.id}`)).status).toBe(403);
    const done = await s.as('u_student').patch<Item>(`/academics/planner/items/${quiz.id}`, { done: true });
    expect(done.body.data!.done).toBe(true);
    await s.as('u_student').patch(`/academics/planner/items/${quiz.id}`, { done: false });
  });

  it('only students in the course can open the original email', async () => {
    const quiz = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!.items.find((i) => i.title === 'Quiz 2 on Tuesday 6 October')!;
    const mine = await s.as('u_student').get<{ body: string }>(`/academics/planner/emails/${quiz.email!.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data!.body).toContain('closed book');
    expect((await s.as('u_student2').get(`/academics/planner/emails/${quiz.email!.id}`)).status).toBe(404);
  });
});

describe('manual tasks and reminders', () => {
  it('quick add creates a timed task on the schedule and in the calendar', async () => {
    const r = await s.as('u_student').post<Item>('/academics/planner/quick', { text: 'Revise CIS 321 ch 5 tomorrow 7pm' });
    expect(r.status).toBe(201);
    const it = r.body.data!;
    expect(it).toMatchObject({ title: 'Revise CIS 321 ch 5', course_code: 'CIS 321', kind: 'task', date: '2026-09-28', editable: true });
    expect(local(it.start_at!)).toBe('2026-09-28 19:00');
    expect(db().get<{ start_at: string }>("SELECT start_at FROM calendar_entries WHERE source_type = 'task' AND source_id = ?", it.id)!.start_at).toBe('2026-09-28T19:00:00+03:00');
  });

  it('dragging on the schedule moves the task and keeps its reminder lead time', async () => {
    const r = await s.as('u_student').post<Item>('/academics/planner/items', { title: 'Call the registrar', kind: 'reminder', date: '2026-09-29', time: '10:00', remind: '1h' });
    expect(local(r.body.data!.remind_at!)).toBe('2026-09-29 09:00');
    const moved = await s.as('u_student').patch<Item>(`/academics/planner/items/${r.body.data!.id}`, { date: '2026-09-30', time: '12:30' });
    expect(local(moved.body.data!.start_at!)).toBe('2026-09-30 12:30');
    expect(local(moved.body.data!.remind_at!)).toBe('2026-09-30 11:30');
  });

  it('reminders that fall due become notifications once', async () => {
    const r = await s.as('u_student').post<Item>('/academics/planner/items', { title: 'Pick up lab kit', kind: 'reminder', date: '2026-09-27', time: '09:05', remind: '15m' });
    const count = () => db().count('notifications', "user_id = 'u_student' AND kind = 'reminder' AND title LIKE '%Pick up lab kit%'");
    await s.as('u_student').get('/academics/planner');
    expect(count()).toBe(1);
    await s.as('u_student').get('/academics/planner');
    expect(count()).toBe(1);
    expect((await s.as('u_student').del(`/academics/planner/items/${r.body.data!.id}`)).status).toBe(200);
  });

  it('a task planned after its deadline counts as overdue', async () => {
    const r = await s.as('u_student').post<Item>('/academics/planner/items', { title: 'Late write-up', date: '2026-09-25' });
    const moved = await s.as('u_student').patch<Item>(`/academics/planner/items/${r.body.data!.id}`, { date: '2026-09-28' });
    expect(moved.body.data!.overdue).toBe(false); // the deadline followed the move
    db().run("UPDATE study_tasks SET deadline = '2026-09-26' WHERE id = ?", r.body.data!.id);
    const list = (await s.as('u_student').get<Planner>('/academics/planner')).body.data!;
    expect(list.items.find((i) => i.id === r.body.data!.id)!.overdue).toBe(true);
  });

  it('other students cannot touch my tasks', async () => {
    const r = await s.as('u_student').post<Item>('/academics/planner/items', { title: 'Private note' });
    expect((await s.as('u_lead').patch(`/academics/planner/items/${r.body.data!.id}`, { done: true })).status).toBe(404);
    expect((await s.as('u_lead').del(`/academics/planner/items/${r.body.data!.id}`)).status).toBe(404);
  });
});

describe('planner migration', () => {
  it('adds the announcements to an existing database once, without touching other data', () => {
    const tasks = db().count('study_tasks', "source <> 'announcement'");
    db().exec("DELETE FROM study_tasks WHERE source = 'announcement'");
    db().exec('DELETE FROM course_assessments'); db().exec('DELETE FROM course_emails');
    db().exec("DELETE FROM calendar_entries WHERE source_type = 'assessment'");
    setSetting('migrations_applied', registeredMigrations().filter((id) => id !== 'planner-v1'));
    expect(runMigrations(db())).toEqual(['planner-v1']);
    expect(db().count('course_emails')).toBe(8);
    expect(db().count('study_tasks', "source <> 'announcement'")).toBe(tasks);
    expect(db().count('study_tasks', "student_id = 'u_student' AND source = 'announcement'")).toBe(5);
    expect(runMigrations(db())).toEqual([]);
  });
});
