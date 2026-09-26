import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { parseTaskLines, parsePreferenceText, resolveDatePhrase } from '../server/modules/academics/nl.ts';

interface Task { id: string; title: string; scheduled_date: string | null; locked: boolean; status: string; progress: number; actual_min: number; history: Array<{ action: string }> }
interface Proposal { id: string; kind: string; status: string; changes: Array<{ taskId: string; from: string | null; to: string | null; why: string }>; infeasible: Array<{ taskId: string; why: string; suggestion: string }>; before_state: { loads: Array<{ date: string; over: boolean }> }; after_state: { loads: Array<{ date: string; over: boolean; capacity: number; task_min: number; tasks: string[] }> } }

let srv: TestServer;
beforeAll(async () => { freshDb(); srv = await startServer(); });
afterAll(async () => { await srv.close(); });

const task = (id: string) => db().get<{ scheduled_date: string | null; locked: number; status: string; actual_min: number; progress: number; history: string }>('SELECT scheduled_date, locked, status, actual_min, progress, history FROM study_tasks WHERE id = ?', id)!;

describe('natural-language intake (deterministic, no model)', () => {
  it('parses course, effort and deadlines in several formats relative to the demo clock', () => {
    const drafts = parseTaskLines('Read ch. 3 for CIS 321, 2h, by Oct 5\nSWE 302 design doc 90 min due 2026-10-03\nPrepare quiz notes for CIS 316 (1.5h) next Tuesday\nfinish something', new Set(['CIS 321', 'SWE 302', 'CIS 316']), '2026-09-27');
    expect(drafts[0]).toMatchObject({ course_code: 'CIS 321', effort_min: 120, deadline: '2026-10-05' });
    expect(drafts[0].title.toLowerCase()).toContain('read ch. 3');
    expect(drafts[1]).toMatchObject({ course_code: 'SWE 302', effort_min: 90, deadline: '2026-10-03' });
    expect(drafts[2]).toMatchObject({ course_code: 'CIS 316', effort_min: 90, deadline: '2026-09-29' });
    expect(drafts[3].issues.length).toBeGreaterThan(0);
    expect(drafts[3].confidence).toBeLessThan(0.6);
    expect(resolveDatePhrase("yesterday's absence", '2026-09-27')?.date).toBe('2026-09-26');
    expect(resolveDatePhrase('last Monday', '2026-09-27')?.date).toBe('2026-09-21');
    expect(resolveDatePhrase('21/09/2026', '2026-09-27')?.date).toBe('2026-09-21');
  });
  it('maps registration preference text to rules', () => {
    const p = parsePreferenceText('avoid early classes, no Thursday, workshop Tuesday 4pm, max 15 credits');
    expect(p.avoidEarly).toBe(true);
    expect(p.avoidDays).toEqual([4]);
    expect(p.keepWindows?.[0]).toMatchObject({ day: 2, start: '16:00' });
    expect(p.maxCredits).toBe(15);
    expect(p.unparsed).toEqual([]);
  });
});

describe('adaptive study planning', () => {
  it('repairs missed/unavailable/overloaded tasks with minimal movement, never moves locked tasks and reports infeasible ones', async () => {
    const sara = srv.as('u_student');
    // make a locked task impossible: its day becomes unavailable
    await sara.put('/academics/study/settings', { unavailable_dates: ['2026-10-01', '2026-10-05'] });
    const r = await sara.post<Proposal>('/academics/study/repair', { reason: 'missed' });
    expect(r.status).toBe(201);
    const p = r.body.data!;
    expect(p.kind).toBe('repair');
    const movedIds = p.changes.map((c) => c.taskId);
    expect(movedIds).toContain('task_sara_05'); // overdue / missed
    expect(movedIds).toContain('task_sara_04'); // on the unavailable date
    expect(movedIds).not.toContain('task_sara_02'); // locked
    expect(movedIds).not.toContain('task_sara_09'); // locked
    expect(movedIds).not.toContain('task_sara_01'); // fine where it is
    for (const c of p.changes) expect(c.to! >= '2026-09-27').toBe(true);
    expect(p.infeasible.map((i) => i.taskId)).toContain('task_sara_02');
    expect(p.infeasible.find((i) => i.taskId === 'task_sara_02')!.suggestion).toMatch(/Unlock/);
    // after-state never exceeds capacity on days the proposal touched
    for (const c of p.changes) { const day = p.after_state.loads.find((l) => l.date === c.to)!; expect(day.task_min).toBeLessThanOrEqual(day.capacity); }
    // nothing applied yet
    expect(task('task_sara_05').scheduled_date).toBe('2026-09-24');
    const apply = await sara.post<{ proposal: Proposal; versionId: string }>(`/academics/study/proposals/${p.id}/apply`);
    expect(apply.status).toBe(200);
    expect(task('task_sara_05').scheduled_date).not.toBe('2026-09-24');
    expect(task('task_sara_02').scheduled_date).toBe('2026-10-05');
    expect(task('task_sara_02').locked).toBe(1);
    expect(JSON.parse(task('task_sara_05').history).map((h: { action: string }) => h.action)).toContain('rescheduled');
    const twice = await sara.post(`/academics/study/proposals/${p.id}/apply`);
    expect(twice.status).toBe(400);
    // calendar entry for the moved task exists on its new date
    const cal = db().get<{ start_at: string }>(`SELECT start_at FROM calendar_entries WHERE owner_id = 'u_student' AND source_type = 'task' AND source_id = 'task_sara_05'`)!;
    expect(cal.start_at.slice(0, 10)).toBe(task('task_sara_05').scheduled_date);
    // other student cannot touch Sara's tasks
    const foreign = await srv.as('u_lead').put('/academics/study/tasks/task_sara_05', { locked: true });
    expect(foreign.status).toBe(404);
  });

  it('schedules unscheduled tasks before their deadlines and within capacity', async () => {
    const sara = srv.as('u_student');
    const r = await sara.post<Proposal>('/academics/study/schedule');
    const p = r.body.data!;
    expect(p.kind).toBe('schedule');
    expect(p.changes.map((c) => c.taskId)).toEqual(expect.arrayContaining(['task_sara_07', 'task_sara_08', 'task_sara_11']));
    const deadlines = Object.fromEntries(db().all<{ id: string; deadline: string | null }>('SELECT id, deadline FROM study_tasks').map((t) => [t.id, t.deadline]));
    for (const c of p.changes) { expect(c.from).toBeNull(); if (deadlines[c.taskId]) expect(c.to! <= deadlines[c.taskId]!).toBe(true); }
    for (const l of p.after_state.loads) expect(l.task_min <= l.capacity || l.tasks.every((id: string) => task(id).locked === 1)).toBe(true);
    await sara.post(`/academics/study/proposals/${p.id}/apply`);
    expect(task('task_sara_07').scheduled_date).not.toBeNull();
  });

  it('restores a version without deleting execution history', async () => {
    const sara = srv.as('u_student');
    const prog = await sara.put<Task>('/academics/study/tasks/task_sara_01', { status: 'partial', add_minutes: 40 });
    expect(prog.body.data!.status).toBe('partial');
    expect(prog.body.data!.actual_min).toBe(40);
    const done = await sara.put<Task>('/academics/study/tasks/task_sara_07', { status: 'done', add_minutes: 45 });
    expect(done.body.data!.status).toBe('done');
    const before = task('task_sara_07');
    const restore = await sara.post<{ restored: number; newVersionId: string }>('/academics/study/versions/spv_sara_baseline/restore');
    expect(restore.status).toBe(200);
    expect(restore.body.data!.restored).toBeGreaterThan(5);
    // dates/locks come back from the baseline...
    expect(task('task_sara_05').scheduled_date).toBe('2026-09-24');
    expect(task('task_sara_07').scheduled_date).toBeNull();
    // ...but progress, actual minutes and history are preserved
    const t1 = task('task_sara_01');
    expect(t1.status).toBe('partial');
    expect(t1.actual_min).toBe(40);
    expect(JSON.parse(t1.history).map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['time_logged', 'partial', 'restored']));
    expect(task('task_sara_07').status).toBe('done');
    expect(task('task_sara_07').actual_min).toBe(before.actual_min);
    // restoring created its own safety snapshot
    expect(db().count('study_plan_versions', `id = '${restore.body.data!.newVersionId}'`)).toBe(1);
    // enrolment is untouched by plan restores
    expect(db().count('transcript_entries', `student_id = 'u_student' AND status = 'enrolled'`)).toBe(5);
  });
});
