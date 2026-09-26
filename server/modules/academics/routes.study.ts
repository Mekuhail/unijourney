import { Router } from 'express';
import { z } from 'zod';
import { db, j, pj } from '../../core/db.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { h, ok, parse, bad } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { removeEntry } from '../../core/calendar.ts';
import { audit } from '../../core/audit.ts';
import { aiAvailable, aiJson } from '../../adapters/ai.ts';
import { studentContext } from './common.ts';
import { parseTaskLines, type TaskDraft } from './nl.ts';
import { applyProposal, dayLoads, discardProposal, getSettings, getTask, HORIZON_DAYS, listTasks, proposalFromRow, proposeRepair, proposeSchedule, restoreVersion, saveSettings, taskCalendarSync, taskFromRow } from './study.ts';

export const studyRouter = Router();

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

studyRouter.get('/study', h((req, res) => {
  const u = requireUser(req);
  const settings = getSettings(u.id);
  const tasks = listTasks(u.id);
  const proposalRow = db().get(`SELECT * FROM study_proposals WHERE student_id = ? AND status = 'preview' ORDER BY created_at DESC LIMIT 1`, u.id);
  const versions = db().all('SELECT id, label, reason, created_at FROM study_plan_versions WHERE student_id = ? ORDER BY created_at DESC', u.id);
  const history = db().all(`SELECT id, kind, trigger, status, created_at, applied_at, changes, infeasible FROM study_proposals WHERE student_id = ? AND status != 'preview' ORDER BY created_at DESC LIMIT 10`, u.id).map((r) => ({ ...r, changes: pj(r.changes, []).length, infeasible: pj(r.infeasible, []).length }));
  const ctx = studentContext(u.id);
  ok(res, { today: todayIso(), settings, tasks, loads: dayLoads(u.id, tasks, settings, todayIso(), HORIZON_DAYS), proposal: proposalRow ? proposalFromRow(proposalRow) : null, versions, history, courses: [...ctx.enrolled] });
}));

studyRouter.put('/study/settings', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ daily_capacity_min: z.number().int().min(0).max(720).optional(), weekday_capacity: z.record(z.string().regex(/^[0-6]$/), z.number().int().min(0).max(720)).optional(), unavailable_dates: z.array(z.string().regex(dateRe)).max(60).optional() }).strict(), req.body ?? {});
  const s = saveSettings(u.id, body);
  audit(u.id, 'academics.study.settings', 'study_settings', u.id, body);
  ok(res, s);
}));

const taskInput = z.object({
  title: z.string().min(1).max(200), course_code: z.string().max(12).nullable().optional(), effort_min: z.number().int().min(5).max(600), deadline: z.string().regex(dateRe).nullable().optional(),
  scheduled_date: z.string().regex(dateRe).nullable().optional(), locked: z.boolean().optional(), priority: z.number().int().min(1).max(3).optional(), notes: z.string().max(1000).nullable().optional(), source: z.enum(['manual', 'nl', 'enrollment', 'resource', 'event', 'repair']).optional(), resource_id: z.string().nullable().optional(), event_id: z.string().nullable().optional()
});

function insertTask(studentId: string, t: z.infer<typeof taskInput>) {
  const now = nowIso();
  const id = newId('task');
  db().insert('study_tasks', { id, student_id: studentId, course_code: t.course_code ?? null, title: t.title, effort_min: t.effort_min, deadline: t.deadline ?? null, scheduled_date: t.scheduled_date ?? null, locked: t.locked ? 1 : 0, status: 'todo', progress: 0, actual_min: 0, source: t.source ?? 'manual', resource_id: t.resource_id ?? null, event_id: t.event_id ?? null, notes: t.notes ?? null, priority: t.priority ?? 2, history: j([{ at: now, action: 'created', by: studentId, source: t.source ?? 'manual' }]), created_at: now, updated_at: now, completed_at: null });
  taskCalendarSync(studentId, id);
  return getTask(studentId, id);
}

studyRouter.post('/study/tasks', h((req, res) => {
  const u = requireUser(req);
  const body = parse(taskInput, req.body ?? {});
  const t = insertTask(u.id, body);
  audit(u.id, 'academics.study.task.create', 'study_task', t.id, { source: t.source });
  ok(res, t, 201);
}));

studyRouter.put('/study/tasks/:id', h((req, res) => {
  const u = requireUser(req);
  const id = req.params.id as string;
  const cur = getTask(u.id, id);
  const body = parse(taskInput.partial().extend({ status: z.enum(['todo', 'partial', 'done']).optional(), progress: z.number().int().min(0).max(100).optional(), actual_min: z.number().int().min(0).max(2000).optional(), add_minutes: z.number().int().min(1).max(600).optional() }).strict(), req.body ?? {});
  const history = [...cur.history];
  const patch: Record<string, unknown> = {};
  const now = nowIso();
  for (const k of ['title', 'course_code', 'effort_min', 'deadline', 'priority', 'notes', 'resource_id', 'event_id'] as const) if (body[k] !== undefined) patch[k] = body[k];
  if (body.scheduled_date !== undefined && body.scheduled_date !== cur.scheduled_date) { patch.scheduled_date = body.scheduled_date; history.push({ at: now, action: 'rescheduled', from: cur.scheduled_date, to: body.scheduled_date, by: u.id }); }
  if (body.locked !== undefined && body.locked !== cur.locked) { patch.locked = body.locked ? 1 : 0; history.push({ at: now, action: body.locked ? 'locked' : 'unlocked', by: u.id }); }
  let actual = cur.actual_min;
  if (body.add_minutes) { actual += body.add_minutes; history.push({ at: now, action: 'time_logged', minutes: body.add_minutes, by: u.id }); }
  if (body.actual_min !== undefined) { actual = body.actual_min; history.push({ at: now, action: 'time_set', minutes: body.actual_min, by: u.id }); }
  patch.actual_min = actual;
  let status = body.status ?? cur.status;
  let progress = body.progress ?? cur.progress;
  if (body.status === 'done') { progress = 100; patch.completed_at = now; history.push({ at: now, action: 'done', actual_min: actual, by: u.id }); }
  else if (body.status === 'partial' || (body.progress !== undefined && body.progress > 0 && body.progress < 100 && body.status === undefined)) { status = 'partial'; if (progress === 0 || progress === 100) progress = Math.min(99, Math.max(10, Math.round((actual / Math.max(1, cur.effort_min)) * 100))); history.push({ at: now, action: 'partial', progress, actual_min: actual, by: u.id }); patch.completed_at = null; }
  else if (body.status === 'todo') { progress = 0; patch.completed_at = null; history.push({ at: now, action: 'reopened', by: u.id }); }
  if (body.progress === 100 && status !== 'done') { status = 'done'; patch.completed_at = now; }
  patch.status = status; patch.progress = progress; patch.history = j(history); patch.updated_at = now;
  db().update('study_tasks', id, patch);
  taskCalendarSync(u.id, id);
  ok(res, getTask(u.id, id));
}));

studyRouter.delete('/study/tasks/:id', h((req, res) => {
  const u = requireUser(req);
  const id = req.params.id as string;
  getTask(u.id, id);
  db().run('DELETE FROM study_tasks WHERE id = ? AND student_id = ?', id, u.id);
  removeEntry(u.id, 'task', id);
  audit(u.id, 'academics.study.task.delete', 'study_task', id, {});
  ok(res, { deleted: id });
}));

studyRouter.post('/study/intake/parse', h(async (req, res) => {
  const u = requireUser(req);
  const { text } = parse(z.object({ text: z.string().min(1).max(4000) }), req.body ?? {});
  const ctx = studentContext(u.id);
  const drafts = parseTaskLines(text, ctx.enrolled);
  let ai: string | null = null;
  const weak = drafts.filter((d) => d.confidence < 0.6);
  if (weak.length && aiAvailable()) {
    const r = await aiJson<{ items: Array<{ line: string; title?: string; course_code?: string; effort_min?: number; deadline?: string }> }>(`Today is ${todayIso()} (Asia/Riyadh). Map each study task line to {line,title,course_code?,effort_min?,deadline?(YYYY-MM-DD)}. Return {items:[...]}. Do not invent deadlines.`, weak.map((d) => d.line).join('\n'), 8000);
    if (r.data?.items) {
      for (const it of r.data.items) {
        const d = drafts.find((x) => x.line === it.line);
        if (!d) continue;
        if (it.title && d.issues.some((i) => i.startsWith('Title'))) d.title = it.title;
        if (typeof it.effort_min === 'number' && it.effort_min >= 5 && it.effort_min <= 600 && d.issues.some((i) => i.startsWith('No effort'))) { d.effort_min = it.effort_min; d.issues = d.issues.filter((i) => !i.startsWith('No effort')); }
        if (it.deadline && dateRe.test(it.deadline) && !d.deadline) { d.deadline = it.deadline; d.issues = d.issues.filter((i) => !i.startsWith('No deadline')); d.issues.push('Deadline suggested by the model — confirm'); }
        if (it.course_code && ctx.enrolled.has(it.course_code) && !d.course_code) d.course_code = it.course_code;
      }
      ai = `Model refined ${r.data.items.length} line(s) (${r.provider}); rules still validated every value.`;
    }
  }
  ok(res, { drafts, ai, today: todayIso(), note: 'Nothing is saved yet — edit the drafts and commit the ones you want.' });
}));

studyRouter.post('/study/intake/commit', h((req, res) => {
  const u = requireUser(req);
  const { drafts, raw_text } = parse(z.object({ drafts: z.array(taskInput.extend({ line: z.string().optional() })).min(1).max(30), raw_text: z.string().max(4000).optional() }), req.body ?? {});
  const created = db().tx(() => {
    const out = drafts.map((d) => insertTask(u.id, { ...d, source: 'nl' }));
    db().insert('study_intake', { id: newId('sin'), student_id: u.id, raw_text: raw_text ?? drafts.map((d) => d.line ?? d.title).join('\n'), parsed: j(drafts as TaskDraft[] | unknown[]), status: 'committed', created_at: nowIso() });
    return out;
  });
  audit(u.id, 'academics.study.intake', 'study_intake', u.id, { count: created.length });
  ok(res, { tasks: created }, 201);
}));

studyRouter.post('/study/schedule', h((req, res) => {
  const u = requireUser(req);
  const p = proposeSchedule(u.id);
  audit(u.id, 'academics.study.propose', 'study_proposal', p.id, { kind: 'schedule', changes: p.changes.length, infeasible: p.infeasible.length });
  ok(res, p, 201);
}));

studyRouter.post('/study/repair', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ reason: z.enum(['missed', 'availability', 'event', 'manual']).optional(), unavailable_dates: z.array(z.string().regex(dateRe)).max(30).optional(), daily_capacity_min: z.number().int().min(0).max(720).optional() }), req.body ?? {});
  if (body.unavailable_dates || body.daily_capacity_min !== undefined) saveSettings(u.id, { ...(body.unavailable_dates ? { unavailable_dates: [...new Set([...getSettings(u.id).unavailable_dates, ...body.unavailable_dates])] } : {}), ...(body.daily_capacity_min !== undefined ? { daily_capacity_min: body.daily_capacity_min } : {}) });
  const p = proposeRepair(u.id, body.reason ?? 'manual');
  audit(u.id, 'academics.study.propose', 'study_proposal', p.id, { kind: 'repair', reason: body.reason, changes: p.changes.length, infeasible: p.infeasible.length });
  ok(res, p, 201);
}));

studyRouter.post('/study/proposals/:id/apply', h((req, res) => {
  const u = requireUser(req);
  const r = applyProposal(u.id, req.params.id as string);
  audit(u.id, 'academics.study.apply', 'study_proposal', r.proposal.id, { version: r.versionId, changes: r.proposal.changes.length });
  ok(res, r);
}));

studyRouter.post('/study/proposals/:id/discard', h((req, res) => {
  const u = requireUser(req);
  ok(res, discardProposal(u.id, req.params.id as string));
}));

studyRouter.post('/study/versions/:id/restore', h((req, res) => {
  const u = requireUser(req);
  const r = restoreVersion(u.id, req.params.id as string);
  audit(u.id, 'academics.study.restore', 'study_plan_version', req.params.id as string, r);
  ok(res, r);
}));

studyRouter.get('/study/tasks/:id', h((req, res) => {
  const u = requireUser(req);
  const r = db().get('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', req.params.id, u.id);
  if (!r) throw bad('Task not found');
  ok(res, taskFromRow(r));
}));
