import { db, j, pj } from '../../core/db.ts';
import { addDays, addMinutesToTime, localToIso, nowIso, todayIso, toLocal, weekdayOf } from '../../core/clock.ts';
import { listEntries, removeEntry, upsertEntry } from '../../core/calendar.ts';
import { newId } from '../../core/ids.ts';
import { bad, notFound } from '../../core/http.ts';

export interface StudySettings { student_id: string; daily_capacity_min: number; weekday_capacity: Record<string, number>; unavailable_dates: string[]; updated_at: string }
export interface StudyTask {
  id: string; student_id: string; course_code: string | null; title: string; effort_min: number; deadline: string | null; scheduled_date: string | null; locked: boolean;
  status: 'todo' | 'partial' | 'done'; progress: number; actual_min: number; source: string; resource_id: string | null; event_id: string | null; notes: string | null; priority: number;
  history: Array<Record<string, unknown>>; created_at: string; updated_at: string; completed_at: string | null;
}
export interface DayLoad { date: string; weekday: number; capacity: number; base_capacity: number; calendar_min: number; task_min: number; remaining: number; unavailable: boolean; over: boolean; tasks: string[] }
export interface PlanChange { taskId: string; title: string; from: string | null; to: string | null; why: string }
export interface Infeasible { taskId: string; title: string; why: string; suggestion: string }

const DAY_WINDOW_MIN = 600; // 10-hour campus day used to scale study capacity by calendar load
export const HORIZON_DAYS = 21;
const TASK_START = '17:00';

// ---------------------------------------------------------------- rows
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function taskFromRow(r: any): StudyTask {
  return { ...r, locked: !!r.locked, history: pj(r.history, []) };
}
export function getSettings(studentId: string): StudySettings {
  const r = db().get('SELECT * FROM study_settings WHERE student_id = ?', studentId);
  if (!r) return { student_id: studentId, daily_capacity_min: 180, weekday_capacity: {}, unavailable_dates: [], updated_at: nowIso() };
  return { student_id: studentId, daily_capacity_min: r.daily_capacity_min as number, weekday_capacity: pj(r.weekday_capacity, {}), unavailable_dates: pj(r.unavailable_dates, []), updated_at: r.updated_at as string };
}
export function saveSettings(studentId: string, s: Partial<StudySettings>): StudySettings {
  const cur = getSettings(studentId);
  const next = { ...cur, ...s, student_id: studentId, updated_at: nowIso() };
  db().upsert('study_settings', { student_id: studentId, daily_capacity_min: next.daily_capacity_min, weekday_capacity: j(next.weekday_capacity), unavailable_dates: j(next.unavailable_dates), updated_at: next.updated_at });
  return next;
}
export function listTasks(studentId: string): StudyTask[] {
  return db().all(`SELECT * FROM study_tasks WHERE student_id = ? ORDER BY COALESCE(scheduled_date, deadline, '9999'), priority, created_at`, studentId).map(taskFromRow);
}
export function getTask(studentId: string, id: string): StudyTask {
  const r = db().get('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', id, studentId);
  if (!r) throw notFound('Task not found');
  return taskFromRow(r);
}

// ---------------------------------------------------------------- calendar sync (one entry per scheduled task)
export function taskCalendarSync(studentId: string, taskId: string) {
  const r = db().get('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', taskId, studentId);
  if (!r || !r.scheduled_date) { removeEntry(studentId, 'task', taskId); return; }
  const start = TASK_START;
  const end = addMinutesToTime(start, Math.max(15, r.effort_min as number));
  upsertEntry(studentId, { source_type: 'task', source_id: taskId, title: `${r.course_code ? r.course_code + ' · ' : ''}${r.title}`, kind: 'task', start_at: localToIso(r.scheduled_date as string, start), end_at: localToIso(r.scheduled_date as string, end), immovable: !!r.locked, link: '/academics/study', meta: { status: r.status, effort_min: r.effort_min } });
}

// ---------------------------------------------------------------- capacity model
/** Calendar minutes per day (classes, exams, events, interviews) — tasks excluded. */
export function calendarLoadByDay(studentId: string, from: string, to: string): Map<string, number> {
  const entries = listEntries(studentId, localToIso(from, '00:00'), localToIso(addDays(to, 1), '00:00'));
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.source_type === 'task') continue;
    const d = toLocal(e.start_at).date;
    const min = Math.max(0, Math.round((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000));
    m.set(d, (m.get(d) ?? 0) + min);
  }
  return m;
}

export function baseCapacity(settings: StudySettings, date: string): number {
  if (settings.unavailable_dates.includes(date)) return 0;
  const wd = String(weekdayOf(date));
  return settings.weekday_capacity[wd] ?? settings.daily_capacity_min;
}

/** Effective study capacity: calendar load shrinks the base capacity proportionally to the 10-hour day. */
export function effectiveCapacity(base: number, calendarMin: number): number {
  if (base <= 0) return 0;
  const factor = Math.max(0, 1 - Math.min(calendarMin, DAY_WINDOW_MIN) / DAY_WINDOW_MIN);
  return Math.round(base * factor / 5) * 5;
}

export function dayLoads(studentId: string, tasks: StudyTask[], settings: StudySettings, from: string, days: number): DayLoad[] {
  const to = addDays(from, days - 1);
  const cal = calendarLoadByDay(studentId, from, to);
  const out: DayLoad[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const base = baseCapacity(settings, date);
    const calendarMin = cal.get(date) ?? 0;
    const capacity = effectiveCapacity(base, calendarMin);
    const dayTasks = tasks.filter((t) => t.scheduled_date === date && t.status !== 'done');
    const taskMin = dayTasks.reduce((s, t) => s + remainingEffort(t), 0);
    out.push({ date, weekday: weekdayOf(date), capacity, base_capacity: base, calendar_min: calendarMin, task_min: taskMin, remaining: capacity - taskMin, unavailable: settings.unavailable_dates.includes(date), over: taskMin > capacity, tasks: dayTasks.map((t) => t.id) });
  }
  return out;
}

export function remainingEffort(t: StudyTask): number {
  if (t.status === 'done') return 0;
  if (t.status === 'partial') return Math.max(15, Math.round(t.effort_min * (1 - Math.min(99, t.progress) / 100)));
  return t.effort_min;
}

// ---------------------------------------------------------------- proposals
export interface StudyProposal {
  id: string; student_id: string; kind: 'schedule' | 'repair'; trigger: string;
  before_state: { assignments: Record<string, string | null>; loads: DayLoad[] };
  after_state: { assignments: Record<string, string | null>; loads: DayLoad[] };
  changes: PlanChange[]; infeasible: Infeasible[]; status: 'preview' | 'applied' | 'discarded'; created_at: string; applied_at: string | null;
}

interface Sim { loads: Map<string, DayLoad>; assign: Map<string, string | null> }
function simulate(studentId: string, tasks: StudyTask[], settings: StudySettings, from: string, days: number): Sim {
  const loads = new Map(dayLoads(studentId, tasks, settings, from, days).map((l) => [l.date, l]));
  const assign = new Map(tasks.map((t) => [t.id, t.scheduled_date]));
  return { loads, assign };
}
function place(sim: Sim, t: StudyTask, date: string) {
  const prev = sim.assign.get(t.id);
  if (prev && sim.loads.has(prev)) { const l = sim.loads.get(prev)!; l.task_min -= remainingEffort(t); l.remaining = l.capacity - l.task_min; l.over = l.task_min > l.capacity; l.tasks = l.tasks.filter((x) => x !== t.id); }
  sim.assign.set(t.id, date);
  const l = sim.loads.get(date);
  if (l) { l.task_min += remainingEffort(t); l.remaining = l.capacity - l.task_min; l.over = l.task_min > l.capacity; l.tasks.push(t.id); }
}
function unplace(sim: Sim, t: StudyTask) {
  const prev = sim.assign.get(t.id);
  if (prev && sim.loads.has(prev)) { const l = sim.loads.get(prev)!; l.task_min -= remainingEffort(t); l.remaining = l.capacity - l.task_min; l.over = l.task_min > l.capacity; l.tasks = l.tasks.filter((x) => x !== t.id); }
  sim.assign.set(t.id, null);
}

/** Candidate days for a task: today..min(deadline, horizon end) with enough remaining capacity. */
function candidateDays(sim: Sim, t: StudyTask, from: string, opts: { near?: string | null; ignoreDeadline?: boolean } = {}): string[] {
  const need = remainingEffort(t);
  const dates = [...sim.loads.keys()].sort();
  const limit = t.deadline && !opts.ignoreDeadline ? t.deadline : dates[dates.length - 1];
  const ok = dates.filter((d) => d >= from && d <= limit && sim.loads.get(d)!.remaining >= need && sim.loads.get(d)!.capacity > 0);
  if (opts.near) {
    const near = opts.near;
    return ok.sort((a, b) => Math.abs(dayDiff(a, near)) - Math.abs(dayDiff(b, near)) || a.localeCompare(b));
  }
  // balanced: least-loaded day first, tie -> earliest
  return ok.sort((a, b) => (sim.loads.get(a)!.task_min / Math.max(1, sim.loads.get(a)!.capacity)) - (sim.loads.get(b)!.task_min / Math.max(1, sim.loads.get(b)!.capacity)) || a.localeCompare(b));
}
function dayDiff(a: string, b: string) { return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000); }

function suggestionFor(t: StudyTask, sim: Sim, from: string): string {
  const need = remainingEffort(t);
  const best = [...sim.loads.values()].filter((l) => l.date >= from && (!t.deadline || l.date <= t.deadline)).sort((a, b) => b.remaining - a.remaining)[0];
  if (t.deadline && t.deadline < from) return `The deadline (${t.deadline}) has already passed — extend the deadline or mark the task as done/partial.`;
  if (best && best.remaining > 0) return `Split the task into a ${best.remaining}-minute part on ${best.date} and the rest later, or raise the capacity for that day.`;
  if (best && best.capacity === 0) return `All days before the deadline are unavailable or fully booked — mark a day as available or extend the deadline.`;
  return `Increase daily capacity (needs ${need} min in one block) or extend the deadline.`;
}

function loadsArray(sim: Sim): DayLoad[] { return [...sim.loads.values()].sort((a, b) => a.date.localeCompare(b.date)).map((l) => ({ ...l, tasks: [...l.tasks] })); }
function assignments(sim: Sim): Record<string, string | null> { return Object.fromEntries(sim.assign); }

function persistProposal(studentId: string, kind: 'schedule' | 'repair', trigger: string, before: Sim, after: Sim, changes: PlanChange[], infeasible: Infeasible[]): StudyProposal {
  const p: StudyProposal = { id: newId('spp'), student_id: studentId, kind, trigger, before_state: { assignments: assignments(before), loads: loadsArray(before) }, after_state: { assignments: assignments(after), loads: loadsArray(after) }, changes, infeasible, status: 'preview', created_at: nowIso(), applied_at: null };
  db().run(`UPDATE study_proposals SET status = 'discarded' WHERE student_id = ? AND status = 'preview'`, studentId);
  db().insert('study_proposals', { id: p.id, student_id: studentId, kind, trigger, before_state: j(p.before_state), after_state: j(p.after_state), changes: j(changes), infeasible: j(infeasible), status: 'preview', created_at: p.created_at, applied_at: null });
  return p;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proposalFromRow(r: any): StudyProposal { return { ...r, before_state: pj(r.before_state, { assignments: {}, loads: [] }), after_state: pj(r.after_state, { assignments: {}, loads: [] }), changes: pj(r.changes, []), infeasible: pj(r.infeasible, []) }; }

/** Schedule every unscheduled open task (earliest deadline first, never after the deadline, locked tasks untouched). */
export function proposeSchedule(studentId: string): StudyProposal {
  const from = todayIso();
  const settings = getSettings(studentId);
  const tasks = listTasks(studentId);
  const before = simulate(studentId, tasks, settings, from, HORIZON_DAYS);
  const after = simulate(studentId, tasks, settings, from, HORIZON_DAYS);
  const changes: PlanChange[] = [];
  const infeasible: Infeasible[] = [];
  const todo = tasks.filter((t) => t.status !== 'done' && !t.scheduled_date && !t.locked).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.priority - b.priority || b.effort_min - a.effort_min);
  for (const t of todo) {
    const days = candidateDays(after, t, from);
    if (!days.length) { infeasible.push({ taskId: t.id, title: t.title, why: t.deadline && t.deadline < from ? `Deadline ${t.deadline} already passed` : `No day before ${t.deadline ?? 'the horizon end'} has ${remainingEffort(t)} free minutes`, suggestion: suggestionFor(t, after, from) }); continue; }
    place(after, t, days[0]);
    changes.push({ taskId: t.id, title: t.title, from: null, to: days[0], why: t.deadline ? `Earliest-deadline-first: due ${t.deadline}; least-loaded feasible day` : 'No deadline: least-loaded day in the horizon' });
  }
  return persistProposal(studentId, 'schedule', 'schedule', before, after, changes, infeasible);
}

/** Repair: move only what is necessary (missed/overdue tasks, tasks on unavailable/overloaded days) with minimal movement. */
export function proposeRepair(studentId: string, reason: 'missed' | 'availability' | 'event' | 'manual' = 'manual'): StudyProposal {
  const from = todayIso();
  const settings = getSettings(studentId);
  const tasks = listTasks(studentId);
  const before = simulate(studentId, tasks, settings, from, HORIZON_DAYS);
  const after = simulate(studentId, tasks, settings, from, HORIZON_DAYS);
  const changes: PlanChange[] = [];
  const infeasible: Infeasible[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const open = tasks.filter((t) => t.status !== 'done');

  // 1. problems: missed (scheduled before today), overdue (deadline passed), unavailable day
  const problems: Array<{ t: StudyTask; why: string }> = [];
  for (const t of open) {
    if (t.scheduled_date && t.scheduled_date < from) problems.push({ t, why: `Missed: was planned for ${t.scheduled_date}` });
    else if (t.scheduled_date && settings.unavailable_dates.includes(t.scheduled_date)) problems.push({ t, why: `${t.scheduled_date} is marked unavailable` });
    else if (!t.scheduled_date && t.deadline && t.deadline < from) problems.push({ t, why: `Overdue: deadline ${t.deadline} passed and the task was never scheduled` });
  }
  // 2. overloaded days: move the fewest unlocked tasks (latest deadline / lowest priority first) until within capacity
  for (const l of [...after.loads.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (l.date < from || !l.over) continue;
    const movable = l.tasks.map((id) => byId.get(id)!).filter((t) => t && !t.locked && !problems.some((p) => p.t.id === t.id)).sort((a, b) => (b.deadline ?? '9999').localeCompare(a.deadline ?? '9999') || b.priority - a.priority);
    let over = l.task_min - l.capacity;
    for (const t of movable) { if (over <= 0) break; problems.push({ t, why: `${l.date} is overloaded by ${over} min (capacity ${l.capacity})` }); over -= remainingEffort(t); }
    if (over > 0) for (const id of l.tasks) { const t = byId.get(id); if (t?.locked) infeasible.push({ taskId: t.id, title: t.title, why: `${l.date} is still overloaded by ${over} min and this task is locked`, suggestion: `Unlock the task, raise the capacity for ${l.date} to at least ${l.task_min} min, or move it manually.` }); }
  }
  // 3. resolve each problem with minimal movement; locked tasks are never moved
  for (const { t, why } of problems) {
    if (t.locked) { infeasible.push({ taskId: t.id, title: t.title, why: `${why} — task is locked`, suggestion: 'Unlock the task or change its date manually; locked tasks are never moved automatically.' }); continue; }
    unplace(after, t);
    const near = t.scheduled_date && t.scheduled_date >= from ? t.scheduled_date : from;
    let days = candidateDays(after, t, from, { near });
    let note = '';
    if (!days.length && t.deadline && t.deadline < from) { days = candidateDays(after, t, from, { near, ignoreDeadline: true }); note = ' (deadline already passed — earliest availability)'; }
    if (!days.length) { infeasible.push({ taskId: t.id, title: t.title, why: `${why}; no feasible day before ${t.deadline ?? 'horizon end'}`, suggestion: suggestionFor(t, after, from) }); continue; }
    place(after, t, days[0]);
    changes.push({ taskId: t.id, title: t.title, from: t.scheduled_date, to: days[0], why: `${why} → moved to the nearest day with ${remainingEffort(t)} free minutes${note}` });
  }
  return persistProposal(studentId, 'repair', reason, before, after, changes, infeasible);
}

export function getProposal(studentId: string, id: string): StudyProposal {
  const r = db().get('SELECT * FROM study_proposals WHERE id = ? AND student_id = ?', id, studentId);
  if (!r) throw notFound('Proposal not found');
  return proposalFromRow(r);
}

export function snapshotVersion(studentId: string, label: string, reason: string) {
  const tasks = db().all('SELECT id, title, course_code, effort_min, deadline, scheduled_date, locked, status, progress, actual_min FROM study_tasks WHERE student_id = ?', studentId);
  const id = newId('spv');
  db().insert('study_plan_versions', { id, student_id: studentId, label, reason, snapshot: j({ tasks }), created_at: nowIso() });
  return id;
}

export function applyProposal(studentId: string, id: string): { proposal: StudyProposal; versionId: string } {
  const p = getProposal(studentId, id);
  if (p.status !== 'preview') throw bad(`Proposal is already ${p.status}`);
  return db().tx(() => {
    const versionId = snapshotVersion(studentId, `Before ${p.kind} (${toLocal(nowIso()).date})`, `Snapshot taken before applying ${p.kind} proposal ${p.id}`);
    const now = nowIso();
    for (const c of p.changes) {
      const t = db().get('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', c.taskId, studentId);
      if (!t || t.locked) continue; // never touch locked tasks even if a stale proposal lists them
      const history = pj<unknown[]>(t.history, []);
      history.push({ at: now, action: 'rescheduled', from: c.from, to: c.to, by: 'proposal', proposal_id: p.id, why: c.why });
      db().update('study_tasks', c.taskId, { scheduled_date: c.to, updated_at: now, history: j(history) });
      taskCalendarSync(studentId, c.taskId);
    }
    db().update('study_proposals', p.id, { status: 'applied', applied_at: now });
    return { proposal: { ...p, status: 'applied' as const, applied_at: now }, versionId };
  });
}

export function discardProposal(studentId: string, id: string): StudyProposal {
  const p = getProposal(studentId, id);
  if (p.status !== 'preview') throw bad(`Proposal is already ${p.status}`);
  db().update('study_proposals', p.id, { status: 'discarded' });
  return { ...p, status: 'discarded' };
}

/** Restores scheduled dates and locks from a version. Progress, actual minutes and history are preserved. */
export function restoreVersion(studentId: string, versionId: string): { restored: number; versionId: string; newVersionId: string } {
  const v = db().get('SELECT * FROM study_plan_versions WHERE id = ? AND student_id = ?', versionId, studentId);
  if (!v) throw notFound('Version not found');
  const snap = pj<{ tasks: Array<{ id: string; scheduled_date: string | null; locked: number }> }>(v.snapshot, { tasks: [] });
  return db().tx(() => {
    const newVersionId = snapshotVersion(studentId, `Before restore of "${v.label}"`, `Snapshot taken before restoring version ${versionId}`);
    const now = nowIso();
    let restored = 0;
    for (const s of snap.tasks) {
      const t = db().get('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', s.id, studentId);
      if (!t) continue;
      const history = pj<unknown[]>(t.history, []);
      history.push({ at: now, action: 'restored', from: t.scheduled_date, to: s.scheduled_date, version_id: versionId });
      db().update('study_tasks', s.id, { scheduled_date: s.scheduled_date, locked: s.locked ? 1 : 0, updated_at: now, history: j(history) });
      taskCalendarSync(studentId, s.id);
      restored++;
    }
    db().run(`UPDATE study_proposals SET status = 'discarded' WHERE student_id = ? AND status = 'preview'`, studentId);
    return { restored, versionId, newVersionId };
  });
}
