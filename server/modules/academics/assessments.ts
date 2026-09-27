import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import type { Db } from '../../core/db.ts';
import { db, j } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { addDays, localToIso, now, nowIso, toLocal, todayIso } from '../../core/clock.ts';
import { notify, registerPendingNotifications } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { config } from '../../core/config.ts';
import { listEntries, removeEntry, upsertEntry } from '../../core/calendar.ts';
import { registerMigration } from '../../core/migrations.ts';
import { CURRENT_TERM } from '../../core/settings.ts';
import { findCourseCodes, resolveDatePhrase } from './nl.ts';

/**
 * Study planner, simplified: a to-do list plus a schedule, filled mostly by itself.
 *
 * When a professor emails a course (or the LMS/syllabus publishes a date), the message is parsed for an assessment:
 * the kind (quiz, midterm, final, assignment, project, lab, presentation), its number, the date and time, and the room.
 * The assessment then becomes, for every enrolled student, a to-do whose title and description are the professor's
 * own words, plus a calendar entry and a notification. A follow-up ("moved to Wednesday") updates the same to-do.
 * Students add their own tasks and reminders with one line ("Revise ch 5 tomorrow 7pm").
 *
 * Parsing is deterministic and bilingual (English and Arabic); nothing leaves the server.
 */
export const plannerRouter = Router();

export type AssessmentKind = 'quiz' | 'midterm' | 'final' | 'assignment' | 'project' | 'lab' | 'presentation';
const EXAM_KINDS = new Set<AssessmentKind>(['quiz', 'midterm', 'final', 'presentation']);
const DURATION: Record<AssessmentKind, number> = { quiz: 30, midterm: 90, final: 120, presentation: 60, assignment: 0, project: 0, lab: 0 };
const EFFORT: Record<AssessmentKind, number> = { quiz: 90, midterm: 240, final: 300, presentation: 120, assignment: 120, project: 180, lab: 90 };

// ------------------------------------------------------------------ parsing
const KIND_RULES: Array<[AssessmentKind, RegExp]> = [
  ['midterm', /\bmid-?term\b|منتصف الفصل|النصفي|ميدتيرم/],
  ['final', /\bfinal (exam|examination)\b|الاختبار النهائي|الامتحان النهائي/],
  ['quiz', /\bquiz(zes)?\b|اختبار (ال)?قصير|كويز/],
  ['presentation', /\bpresentations?\b|عرض تقديمي/],
  ['project', /\bproject\b|مشروع/],
  ['lab', /\blab( report)?\b|تقرير المعمل|المعمل/],
  ['assignment', /\bassignment\b|\bhomework\b|\bproblem set\b|واجب|تكليف/]
];
const MOVE_RE = /\b(moved|postponed|rescheduled|changed to|now on|new date)\b|تأجيل|تم تغيير|نُقل|نقل الموعد|الموعد الجديد/;
const CANCEL_RE = /\bcancel(l)?ed\b|أُلغي|ألغي|إلغاء/;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const AR_REPLACE: Array<[RegExp, string]> = [
  [/الأحد|الاحد/g, 'sunday'], [/الإثنين|الاثنين/g, 'monday'], [/الثلاثاء/g, 'tuesday'], [/الأربعاء|الاربعاء/g, 'wednesday'], [/الخميس/g, 'thursday'], [/الجمعة/g, 'friday'], [/السبت/g, 'saturday'],
  [/يناير/g, 'jan'], [/فبراير/g, 'feb'], [/مارس/g, 'mar'], [/أبريل|ابريل/g, 'apr'], [/مايو/g, 'may'], [/يونيو/g, 'jun'], [/يوليو/g, 'jul'], [/أغسطس|اغسطس/g, 'aug'], [/سبتمبر/g, 'sep'], [/أكتوبر|اكتوبر/g, 'oct'], [/نوفمبر/g, 'nov'], [/ديسمبر/g, 'dec'],
  [/غدًا|غدا|بكرة/g, 'tomorrow'], [/اليوم/g, 'today'],
  [/(\d)\s*(صباحًا|صباحا|ص)(?=\s|$|[.,،])/g, '$1 am'], [/(\d)\s*(مساءً|مساء|م)(?=\s|$|[.,،])/g, '$1 pm'], [/الساعة/g, 'at'], [/منتصف الليل/g, 'midnight'], [/الظهر/g, 'noon']
];

/** Arabic day/month names, digits and am/pm to the English forms the date resolver understands. */
export function normaliseForDates(text: string) {
  let s = text.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  for (const [re, rep] of AR_REPLACE) s = s.replace(re, rep);
  return s.toLowerCase();
}

const pad = (n: number) => String(n).padStart(2, '0');
function to24(h: number, m: number, ampm?: string) {
  let hh = h;
  if (ampm === 'pm' && hh < 12) hh += 12;
  if (ampm === 'am' && hh === 12) hh = 0;
  if (!ampm && hh >= 1 && hh <= 7) hh += 12; // "at 2" on a teaching day means 14:00
  return `${pad(Math.min(23, hh))}:${pad(Math.min(59, m))}`;
}

/** Start (and end) time in a sentence: "10:00–11:30", "from 1 to 2:30 pm", "at 11", "by 11:59 pm", "midnight". */
export function parseTimes(text: string): { start: string | null; end: string | null; phrase: string | null } {
  const t = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  let m = /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till|حتى|إلى)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|(?:from\s+)?(\d{1,2}):(\d{2})\s*(?:-|–|to|until|حتى|إلى)\s*(\d{1,2}):(\d{2})/.exec(t);
  if (m) {
    if (m[7]) return { start: to24(+m[7], +m[8]), end: to24(+m[9], +m[10]), phrase: m[0] };
    const endAm = m[6];
    return { start: to24(+m[1], +(m[2] ?? 0), m[3] ?? endAm), end: to24(+m[4], +(m[5] ?? 0), endAm), phrase: m[0] };
  }
  if ((m = /\bmidnight\b/.exec(t))) return { start: '23:59', end: null, phrase: m[0] };
  if ((m = /\bnoon\b/.exec(t))) return { start: '12:00', end: null, phrase: m[0] };
  if ((m = /\b(?:at|by|before|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t))) return { start: to24(+m[1], +(m[2] ?? 0), m[3]), end: null, phrase: m[0] };
  if ((m = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/.exec(t))) return { start: to24(+m[1], +m[2], m[3]), end: null, phrase: m[0] };
  if ((m = /\b(\d{1,2})\s*(am|pm)\b/.exec(t))) return { start: to24(+m[1], 0, m[2]), end: null, phrase: m[0] };
  return { start: null, end: null, phrase: null };
}

/** The kind mentioned first in the text. */
function kindOf(text: string): AssessmentKind | null {
  let best: { kind: AssessmentKind; at: number } | null = null;
  for (const [kind, re] of KIND_RULES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { kind, at: m.index };
  }
  return best?.kind ?? null;
}

export interface ParsedAnnouncement { kind: AssessmentKind; number: number | null; date: string | null; start: string | null; end: string | null; room: string | null; moved: boolean; cancelled: boolean }

export function parseAnnouncement(subject: string, body: string, today = todayIso()): ParsedAnnouncement | null {
  const raw = `${subject}\n${body}`;
  const lower = raw.toLowerCase();
  // The subject names the assessment more reliably than the body ("Quiz 1 cancelled; its weight moves to the final exam").
  const kind = kindOf(subject.toLowerCase()) ?? kindOf(body.toLowerCase());
  if (!kind) return null;
  const num = /\b(?:quiz|assignment|homework|lab(?: report)?|project|presentation|problem set)\s*(?:no\.?|#)?\s*(\d{1,2})\b/.exec(lower) ?? /(?:رقم|المعمل|الواجب|الاختبار القصير)\s*(\d{1,2}|[٠-٩]{1,2})/.exec(raw);
  const number = num ? Number(normaliseForDates(num[1])) : null;
  const norm = normaliseForDates(raw);
  // Prefer the sentence that carries the new date when the email moves an assessment.
  const moved = MOVE_RE.test(lower) || MOVE_RE.test(raw);
  const moveSentence = moved ? norm.split(/[.\n!؟]/).find((s) => /moved|postponed|rescheduled|new date|now on|to (sunday|monday|tuesday|wednesday|thursday|friday|saturday)/.test(s) || /تأجيل|تغيير|نقل/.test(s)) : null;
  const dateSrc = moveSentence && resolveDatePhrase(moveSentence, today) ? moveSentence : norm;
  const date = resolveDatePhrase(dateSrc, today)?.date ?? null;
  const times = parseTimes(dateSrc === norm ? norm : `${moveSentence} ${norm}`);
  const room = (/\b(?:room|in|hall|lab)\s+([a-z])\s?-?\s?(\d{3}[a-z]?)\b/i.exec(raw) ?? /(?:قاعة|القاعة|في)\s+([A-Za-z])\s?-?\s?(\d{3})/.exec(raw));
  return { kind, number, date, start: times.start, end: times.end, room: room ? `${room[1].toUpperCase()}${room[2].toUpperCase()}` : null, moved, cancelled: CANCEL_RE.test(lower) || CANCEL_RE.test(raw) };
}

// ------------------------------------------------------------------ ingest: email → assessment → every enrolled student
interface EmailRow { id: string; course_code: string; term: string; section_id: string | null; from_name: string; from_email: string; subject: string; body: string; source: string; received_at: string; assessment_id: string | null; parse_note: string | null }
interface AssessmentRow { id: string; course_code: string; term: string; section_id: string | null; kind: AssessmentKind; number: number | null; title: string; description: string; due_at: string; end_at: string | null; all_day: number; location_id: string | null; location_text: string | null; email_id: string | null; status: string }

function findRoom(d: Db, code: string | null, courseCode: string, sectionId: string | null): { id: string | null; text: string | null } {
  if (!code) return { id: null, text: null };
  const campus = (sectionId ? d.get<{ campus_id: string }>('SELECT campus_id FROM course_sections WHERE id = ?', sectionId) : d.get<{ campus_id: string }>('SELECT campus_id FROM course_sections WHERE course_code = ? ORDER BY term DESC LIMIT 1', courseCode))?.campus_id ?? 'riyadh';
  const loc = d.all<{ id: string; name_en: string }>("SELECT id, name_en FROM campus_locations WHERE campus_id = ? AND kind IN ('room','lab','hall','auditorium')", campus)
    .find((l) => l.name_en.toUpperCase().replace(/[\s-]/g, '').includes(code));
  return { id: loc?.id ?? null, text: loc ? loc.name_en : code };
}

function recipientsOf(d: Db, a: Pick<AssessmentRow, 'course_code' | 'term' | 'section_id'>) {
  return d.all<{ student_id: string }>("SELECT DISTINCT student_id FROM transcript_entries WHERE course_code = ? AND term = ? AND status = 'enrolled' AND (? IS NULL OR section_id = ?)", a.course_code, a.term, a.section_id, a.section_id).map((r) => r.student_id);
}

const kindLabel = (k: AssessmentKind) => ({ quiz: 'Quiz', midterm: 'Midterm', final: 'Final exam', assignment: 'Assignment', project: 'Project', lab: 'Lab', presentation: 'Presentation' })[k];

/** Creates or updates each enrolled student's to-do and calendar entry for one assessment. */
function fanOut(d: Db, a: AssessmentRow, event: 'new' | 'moved' | 'cancelled', opts: { notify: boolean }) {
  const exam = EXAM_KINDS.has(a.kind);
  const dueLocal = toLocal(a.due_at);
  for (const sid of recipientsOf(d, a)) {
    const existing = d.get<{ task_id: string }>('SELECT t.task_id FROM study_task_times t JOIN study_tasks s ON s.id = t.task_id WHERE t.assessment_id = ? AND s.student_id = ?', a.id, sid);
    const at = nowIso();
    let taskId = existing?.task_id;
    if (a.status === 'cancelled') {
      if (taskId) { d.run("UPDATE study_tasks SET status = 'done', notes = ?, updated_at = ? WHERE id = ?", `Cancelled by the instructor.\n\n${a.description}`.slice(0, 1000), at, taskId); removeEntry(sid, 'assessment', a.id); }
    } else if (taskId) {
      d.run('UPDATE study_tasks SET title = ?, notes = ?, deadline = ?, updated_at = ? WHERE id = ?', a.title, a.description.slice(0, 1000), dueLocal.date, at, taskId);
      d.run('UPDATE study_task_times SET due_at = ?, start_at = ?, end_at = ?, remind_at = ?, reminded = 0 WHERE task_id = ?', a.due_at, exam ? a.due_at : null, exam ? a.end_at : null, remindBefore(a.due_at, 24 * 60), taskId);
    } else {
      taskId = newId('task');
      d.insert('study_tasks', { id: taskId, student_id: sid, course_code: a.course_code, title: a.title, effort_min: EFFORT[a.kind], deadline: dueLocal.date, scheduled_date: null, locked: 1, status: 'todo', progress: 0, actual_min: 0, source: 'announcement', resource_id: null, event_id: null, notes: a.description.slice(0, 1000), priority: a.kind === 'midterm' || a.kind === 'final' ? 1 : 2, history: j([{ at, action: 'created', by: 'announcement', source: a.email_id }]), created_at: at, updated_at: at, completed_at: null });
      d.insert('study_task_times', { task_id: taskId, kind: 'assessment', due_at: a.due_at, start_at: exam ? a.due_at : null, end_at: exam ? a.end_at : null, remind_at: remindBefore(a.due_at, 24 * 60), reminded: 0, urgency: a.kind === 'midterm' || a.kind === 'final' ? 'high' : exam ? 'medium' : 'medium', assessment_id: a.id });
    }
    if (a.status !== 'cancelled') {
      const start = exam ? a.due_at : new Date(new Date(a.due_at).getTime() - 30 * 60000).toISOString();
      const end = exam ? a.end_at ?? a.due_at : a.due_at;
      upsertEntry(sid, { source_type: 'assessment', source_id: a.id, title: `${a.course_code} · ${a.title}`, kind: exam ? 'exam' : 'deadline', start_at: calIso(start), end_at: calIso(end), location_id: a.location_id, location_text: a.location_text, immovable: true, link: `/academics/study?item=${taskId}`, meta: { kind: a.kind } });
    }
    if (!opts.notify) continue;
    const when = `${dueLocal.date} ${dueLocal.time}`;
    notify(sid, {
      module: 'academics', kind: 'assessment',
      title: event === 'new' ? `${a.course_code}: ${kindLabel(a.kind)}${a.number ? ` ${a.number}` : ''} added to your planner` : event === 'moved' ? `${a.course_code}: ${kindLabel(a.kind)}${a.number ? ` ${a.number}` : ''} moved` : `${a.course_code}: ${kindLabel(a.kind)}${a.number ? ` ${a.number}` : ''} cancelled`,
      body: event === 'cancelled' ? a.title : `${a.title} · ${when}${a.location_text ? ` · ${a.location_text}` : ''}`,
      link: `/academics/study?item=${taskId}`
    });
  }
}

/** Planner times are stored as UTC instants; calendar entries use Riyadh local time with an explicit offset. */
function calIso(instant: string) {
  const l = toLocal(instant);
  return localToIso(l.date, l.time);
}

function remindBefore(dueIso: string, minutes: number) {
  return new Date(new Date(dueIso).getTime() - minutes * 60000).toISOString();
}

/** Stores a course email and, when it announces an assessment, schedules it for every enrolled student. */
export function ingestCourseEmail(d: Db, input: { id?: string; course_code: string; term?: string; section_id?: string | null; from_name: string; from_email: string; subject: string; body: string; source?: string; received_at?: string }, opts: { today?: string; notify?: boolean } = {}) {
  const id = input.id ?? newId('cem');
  if (d.get('SELECT 1 FROM course_emails WHERE id = ?', id)) return { email: d.get<EmailRow>('SELECT * FROM course_emails WHERE id = ?', id)!, assessment: null, recipients: 0, created: false };
  const term = input.term ?? CURRENT_TERM;
  const received = input.received_at ?? nowIso();
  const today = opts.today ?? toLocal(received).date;
  const p = parseAnnouncement(input.subject, input.body, today);
  let assessment: AssessmentRow | null = null;
  let note: string | null = null;
  let event: 'new' | 'moved' | 'cancelled' = 'new';
  if (!p) note = 'No assessment found in this message.';
  else {
    const prior = p.number !== null
      ? d.get<AssessmentRow>("SELECT * FROM course_assessments WHERE course_code = ? AND term = ? AND kind = ? AND number = ? AND (section_id IS ? OR section_id = ?) ORDER BY created_at DESC LIMIT 1", input.course_code, term, p.kind, p.number, input.section_id ?? null, input.section_id ?? null)
      : (p.kind === 'midterm' || p.kind === 'final') ? d.get<AssessmentRow>("SELECT * FROM course_assessments WHERE course_code = ? AND term = ? AND kind = ? ORDER BY created_at DESC LIMIT 1", input.course_code, term, p.kind) : undefined;
    if (p.cancelled && prior) {
      d.update('course_assessments', prior.id, { status: 'cancelled', updated_at: nowIso(), email_id: id });
      assessment = { ...prior, status: 'cancelled' };
      event = 'cancelled';
    } else if (!p.date) {
      note = 'An assessment is mentioned but no date was found, so nothing was scheduled.';
    } else {
      const exam = EXAM_KINDS.has(p.kind);
      const start = p.start ?? (exam ? '09:00' : '23:59');
      const dueAt = new Date(localToIso(p.date, start)).toISOString();
      const endAt = exam ? new Date(localToIso(p.date, p.end ?? addMinutes(start, DURATION[p.kind]))).toISOString() : null;
      const room = findRoom(d, p.room, input.course_code, input.section_id ?? null);
      if (prior && (p.moved || prior.due_at !== dueAt)) {
        d.update('course_assessments', prior.id, { due_at: dueAt, end_at: endAt, all_day: p.start ? 0 : 1, location_id: room.id ?? prior.location_id, location_text: room.text ?? prior.location_text, description: `${input.body.trim()}\n\n— ${prior.description}`.slice(0, 2000), updated_at: nowIso(), email_id: id, status: 'scheduled' });
        assessment = d.get<AssessmentRow>('SELECT * FROM course_assessments WHERE id = ?', prior.id)!;
        event = 'moved';
      } else if (prior) {
        assessment = prior;
        note = 'Already on the planner.';
      } else {
        const aid = newId('asm');
        d.insert('course_assessments', { id: aid, course_code: input.course_code, term, section_id: input.section_id ?? null, kind: p.kind, number: p.number, title: input.subject.trim(), description: input.body.trim(), due_at: dueAt, end_at: endAt, all_day: p.start ? 0 : 1, location_id: room.id, location_text: room.text, email_id: id, status: 'scheduled', created_at: nowIso(), updated_at: nowIso() });
        assessment = d.get<AssessmentRow>('SELECT * FROM course_assessments WHERE id = ?', aid)!;
      }
    }
  }
  d.insert('course_emails', { id, course_code: input.course_code, term, section_id: input.section_id ?? null, from_name: input.from_name, from_email: input.from_email, subject: input.subject, body: input.body, source: input.source ?? 'email', received_at: received, assessment_id: assessment?.id ?? null, parse_note: note, created_at: nowIso() });
  let recipients = 0;
  if (assessment && note !== 'Already on the planner.') { fanOut(d, assessment, event, { notify: opts.notify ?? true }); recipients = recipientsOf(d, assessment).length; }
  return { email: d.get<EmailRow>('SELECT * FROM course_emails WHERE id = ?', id)!, assessment, recipients, created: true };
}

function demoAddress(name: string) {
  return `${name.toLowerCase().replace(/^dr\.\s*/, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@yu-demo.invalid`;
}

function addMinutes(t: string, n: number) {
  const [h, m] = t.split(':').map(Number);
  const tot = Math.min(23 * 60 + 59, h * 60 + m + n);
  return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
}

// ------------------------------------------------------------------ planner API
interface TaskRow { id: string; student_id: string; course_code: string | null; title: string; effort_min: number; deadline: string | null; scheduled_date: string | null; status: string; source: string; notes: string | null; priority: number; completed_at: string | null }
interface TimeRow { task_id: string; kind: string; due_at: string | null; start_at: string | null; end_at: string | null; remind_at: string | null; reminded: number; urgency: string; assessment_id: string | null }

function itemView(t: TaskRow, tm: TimeRow | undefined) {
  const a = tm?.assessment_id ? db().get<AssessmentRow>('SELECT * FROM course_assessments WHERE id = ?', tm.assessment_id) : null;
  const email = a?.email_id ? db().get<EmailRow>('SELECT id, from_name, from_email, subject, received_at, source FROM course_emails WHERE id = ?', a.email_id) : null;
  const due = tm?.due_at ?? null;
  const date = due ? toLocal(due).date : t.scheduled_date ?? t.deadline;
  const nowMs = now().getTime();
  return {
    id: t.id,
    title: t.title,
    description: t.notes ?? '',
    course_code: t.course_code,
    kind: (tm?.kind ?? 'task') as 'task' | 'reminder' | 'assessment',
    assessment_kind: a?.kind ?? null,
    date,
    deadline: t.deadline,
    due_at: due,
    start_at: tm?.start_at ?? null,
    end_at: tm?.end_at ?? null,
    all_day: !due || !!a?.all_day,
    remind_at: tm?.remind_at ?? null,
    urgency: (tm?.urgency ?? (t.priority === 1 ? 'high' : t.priority === 3 ? 'low' : 'medium')) as 'high' | 'medium' | 'low',
    done: t.status === 'done',
    source: t.source,
    location_text: a?.location_text ?? null,
    location_id: a?.location_id ?? null,
    cancelled: a?.status === 'cancelled',
    email: email ? { id: email.id, from_name: email.from_name, subject: email.subject, received_at: email.received_at, source: email.source } : null,
    // Past its time, or planned for later than a deadline that has already gone by.
    overdue: t.status !== 'done' && (due ? new Date(due).getTime() < nowMs : (!!date && date < todayIso()) || (!!t.deadline && t.deadline < todayIso())),
    editable: !a
  };
}

function ownTask(u: User, id: string) {
  const t = db().get<TaskRow>('SELECT * FROM study_tasks WHERE id = ? AND student_id = ?', id, u.id);
  if (!t) throw notFound('Task not found');
  return t;
}

/** Reminders that fell due since the last visit become notifications (the demo clock is frozen, so we check on read). */
function deliverReminders(userId: string) {
  const due = db().all<TimeRow & { title: string; course_code: string | null; status: string }>("SELECT t.*, s.title, s.course_code, s.status FROM study_task_times t JOIN study_tasks s ON s.id = t.task_id WHERE s.student_id = ? AND t.reminded = 0 AND t.remind_at IS NOT NULL AND t.remind_at <= ? AND s.status <> 'done'", userId, nowIso());
  for (const r of due) {
    db().run('UPDATE study_task_times SET reminded = 1 WHERE task_id = ?', r.task_id);
    notify(userId, { module: 'academics', kind: 'reminder', title: `Reminder: ${r.course_code ? `${r.course_code} · ` : ''}${r.title}`, body: r.due_at ? `Due ${toLocal(r.due_at).date} ${toLocal(r.due_at).time}` : '', link: `/academics/study?item=${r.task_id}` });
  }
}

registerPendingNotifications(deliverReminders);

plannerRouter.get('/planner', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
  deliverReminders(u.id);
  const today = todayIso();
  const from = q.from ?? addDays(today, -7), to = q.to ?? addDays(today, 42);
  const rows = db().all<TaskRow>('SELECT * FROM study_tasks WHERE student_id = ? ORDER BY COALESCE(deadline, scheduled_date, created_at)', u.id);
  const times = new Map(db().all<TimeRow>('SELECT t.* FROM study_task_times t JOIN study_tasks s ON s.id = t.task_id WHERE s.student_id = ?', u.id).map((r) => [r.task_id, r]));
  const items = rows.map((r) => itemView(r, times.get(r.id)));
  // Classes and other fixed commitments for the schedule (tasks and assessments come from `items`).
  const busy = listEntries(u.id, localToIso(from, '00:00'), localToIso(addDays(to, 1), '00:00')).filter((e) => e.source_type !== 'task' && e.source_type !== 'assessment');
  const courses = db().all<{ course_code: string }>("SELECT DISTINCT course_code FROM transcript_entries WHERE student_id = ? AND term = ? AND status = 'enrolled' ORDER BY course_code", u.id, CURRENT_TERM).map((r) => r.course_code);
  const emails = courses.length ? db().all<EmailRow>(`SELECT * FROM course_emails WHERE term = ? AND course_code IN (${courses.map(() => '?').join(',')}) ORDER BY received_at DESC LIMIT 12`, CURRENT_TERM, ...courses)
    .filter((e) => !e.section_id || !!db().get("SELECT 1 FROM transcript_entries WHERE student_id = ? AND section_id = ? AND status = 'enrolled'", u.id, e.section_id))
    .map((e) => ({ id: e.id, course_code: e.course_code, from_name: e.from_name, subject: e.subject, received_at: e.received_at, source: e.source, scheduled: !!e.assessment_id, note: e.parse_note })) : [];
  ok(res, { today, now: nowIso(), from, to, items, busy, courses, emails, demo: config.demoMode });
}));

const itemInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  course_code: z.string().max(12).nullable().optional(),
  kind: z.enum(['task', 'reminder']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  duration_min: z.number().int().min(5).max(600).optional(),
  urgency: z.enum(['high', 'medium', 'low']).optional(),
  remind: z.enum(['none', 'at', '15m', '1h', '1d']).optional()
});
const REMIND_MIN: Record<string, number> = { at: 0, '15m': 15, '1h': 60, '1d': 1440 };

function syncManualCalendar(studentId: string, taskId: string) {
  const t = db().get<TaskRow>('SELECT * FROM study_tasks WHERE id = ?', taskId)!;
  const tm = db().get<TimeRow>('SELECT * FROM study_task_times WHERE task_id = ?', taskId);
  if (!tm?.start_at || t.status === 'done') { removeEntry(studentId, 'task', taskId); return; }
  upsertEntry(studentId, { source_type: 'task', source_id: taskId, title: `${t.course_code ? `${t.course_code} · ` : ''}${t.title}`, kind: tm.kind === 'reminder' ? 'personal' : 'task', start_at: calIso(tm.start_at), end_at: calIso(tm.end_at ?? tm.start_at), link: `/academics/study?item=${taskId}`, meta: { planner: true } });
}

function createItem(u: User, b: z.infer<typeof itemInput>, source = 'manual') {
  const at = nowIso();
  const id = newId('task');
  const kind = b.kind ?? 'task';
  const startIso = b.date && b.time ? new Date(localToIso(b.date, b.time)).toISOString() : null;
  const dur = b.duration_min ?? (kind === 'reminder' ? 15 : 60);
  db().tx(() => {
    db().insert('study_tasks', { id, student_id: u.id, course_code: b.course_code ?? null, title: b.title, effort_min: Math.max(5, dur), deadline: b.date ?? null, scheduled_date: b.date ?? null, locked: 0, status: 'todo', progress: 0, actual_min: 0, source, resource_id: null, event_id: null, notes: b.description || null, priority: b.urgency === 'high' ? 1 : b.urgency === 'low' ? 3 : 2, history: j([{ at, action: 'created', by: u.id, source }]), created_at: at, updated_at: at, completed_at: null });
    db().insert('study_task_times', { task_id: id, kind, due_at: startIso, start_at: startIso, end_at: startIso ? new Date(new Date(startIso).getTime() + dur * 60000).toISOString() : null, remind_at: startIso && b.remind && b.remind !== 'none' ? remindBefore(startIso, REMIND_MIN[b.remind]) : null, reminded: 0, urgency: b.urgency ?? 'medium', assessment_id: null });
    syncManualCalendar(u.id, id);
    audit(u.id, 'academics.planner.create', 'study_task', id, { kind, source });
  });
  return itemView(db().get<TaskRow>('SELECT * FROM study_tasks WHERE id = ?', id)!, db().get<TimeRow>('SELECT * FROM study_task_times WHERE task_id = ?', id));
}

plannerRouter.post('/planner/items', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'student')) throw forbidden('The planner is for students');
  ok(res, createItem(u, parse(itemInput, req.body)), 201);
}));

/** One line in, one item out: "Revise CIS 321 ch 5 tomorrow 7pm", "remind me to email Dr. Hala Sunday 9am". */
export function parseQuickLine(text: string, known: Set<string>, today = todayIso()) {
  const norm = normaliseForDates(text);
  const date = resolveDatePhrase(norm, today);
  const time = parseTimes(norm);
  const course = findCourseCodes(text, known)[0] ?? null;
  const reminder = /\bremind(er)?\b|ذكرني|تذكير/.test(norm);
  const high = /\b(urgent|important|asap)\b|!{1,}|مهم|عاجل/.test(norm);
  let title = text;
  for (const phrase of [date?.phrase, time.phrase]) if (phrase) title = title.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  title = title.replace(/\b(remind me to|remind me|reminder:?)\b/i, ' ').replace(/ذكرني (أن|ب)?/, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,.:-]+|[\s,.:-]+$/g, '').trim();
  return { title: title || text.trim(), date: date?.date ?? null, time: time.start, end_time: time.end, course_code: course, kind: reminder ? 'reminder' as const : 'task' as const, urgency: high ? 'high' as const : 'medium' as const };
}

plannerRouter.post('/planner/quick', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'student')) throw forbidden('The planner is for students');
  const b = parse(z.object({ text: z.string().trim().min(2).max(300), dry_run: z.boolean().optional() }), req.body);
  const known = new Set(db().all<{ course_code: string }>("SELECT DISTINCT course_code FROM transcript_entries WHERE student_id = ? AND status = 'enrolled'", u.id).map((r) => r.course_code));
  const p = parseQuickLine(b.text, known);
  if (b.dry_run) { ok(res, p); return; }
  const dur = p.end_time && p.time ? Math.max(15, (Number(p.end_time.slice(0, 2)) * 60 + Number(p.end_time.slice(3))) - (Number(p.time.slice(0, 2)) * 60 + Number(p.time.slice(3)))) : undefined;
  ok(res, createItem(u, { title: p.title, course_code: p.course_code, kind: p.kind, date: p.date, time: p.time, duration_min: dur, urgency: p.urgency, remind: p.kind === 'reminder' && p.time ? 'at' : p.time ? '15m' : 'none' }, 'quick'), 201);
}));

plannerRouter.patch('/planner/items/:id', h((req, res) => {
  const u = requireUser(req);
  const t = ownTask(u, req.params.id as string);
  const tm = db().get<TimeRow>('SELECT * FROM study_task_times WHERE task_id = ?', t.id);
  const b = parse(itemInput.partial().extend({ done: z.boolean().optional() }), req.body);
  const fromProfessor = !!tm?.assessment_id;
  const edits = Object.keys(b).filter((k) => k !== 'done');
  if (fromProfessor && edits.length) throw forbidden('Assessment details come from your instructor; you can only mark them done.');
  const at = nowIso();
  db().tx(() => {
    if (b.done !== undefined) db().update('study_tasks', t.id, { status: b.done ? 'done' : 'todo', progress: b.done ? 100 : 0, completed_at: b.done ? at : null, updated_at: at });
    if (edits.length) {
      // Moving an item changes the day it is planned for; a real deadline only follows when it was that same day.
      const oldDate = tm?.start_at ? toLocal(tm.start_at).date : t.scheduled_date ?? t.deadline;
      const followDeadline = !t.deadline || t.deadline === oldDate;
      db().update('study_tasks', t.id, {
        ...(b.title !== undefined ? { title: b.title } : {}), ...(b.description !== undefined ? { notes: b.description || null } : {}),
        ...(b.course_code !== undefined ? { course_code: b.course_code } : {}), ...(b.urgency ? { priority: b.urgency === 'high' ? 1 : b.urgency === 'low' ? 3 : 2 } : {}),
        ...(b.date !== undefined ? { scheduled_date: b.date, ...(followDeadline ? { deadline: b.date } : {}) } : {}), updated_at: at
      });
      const date = b.date !== undefined ? b.date : oldDate;
      const time = b.time !== undefined ? b.time : tm?.start_at ? toLocal(tm.start_at).time : null;
      const oldDur = tm?.start_at && tm.end_at ? Math.round((new Date(tm.end_at).getTime() - new Date(tm.start_at).getTime()) / 60000) : Math.min(180, t.effort_min || 60);
      const dur = b.duration_min ?? oldDur;
      const startIso = date && time ? new Date(localToIso(date, time)).toISOString() : null;
      const keepLead = tm?.remind_at && tm.start_at ? new Date(tm.start_at).getTime() - new Date(tm.remind_at).getTime() : null;
      const remindAt = b.remind ? (startIso && b.remind !== 'none' ? remindBefore(startIso, REMIND_MIN[b.remind]) : null) : startIso && keepLead !== null ? new Date(new Date(startIso).getTime() - keepLead).toISOString() : null;
      db().run('INSERT INTO study_task_times (task_id, kind, due_at, start_at, end_at, remind_at, reminded, urgency, assessment_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL) ON CONFLICT(task_id) DO UPDATE SET kind = excluded.kind, due_at = excluded.due_at, start_at = excluded.start_at, end_at = excluded.end_at, remind_at = excluded.remind_at, reminded = 0, urgency = excluded.urgency',
        t.id, b.kind ?? tm?.kind ?? 'task', startIso, startIso, startIso ? new Date(new Date(startIso).getTime() + dur * 60000).toISOString() : null, remindAt, b.urgency ?? tm?.urgency ?? 'medium');
    }
    if (!fromProfessor) syncManualCalendar(u.id, t.id);
  });
  ok(res, itemView(db().get<TaskRow>('SELECT * FROM study_tasks WHERE id = ?', t.id)!, db().get<TimeRow>('SELECT * FROM study_task_times WHERE task_id = ?', t.id)));
}));

plannerRouter.delete('/planner/items/:id', h((req, res) => {
  const u = requireUser(req);
  const t = ownTask(u, req.params.id as string);
  const tm = db().get<TimeRow>('SELECT * FROM study_task_times WHERE task_id = ?', t.id);
  if (tm?.assessment_id) throw forbidden('Assessments come from your instructor; mark them done instead.');
  db().tx(() => {
    removeEntry(u.id, 'task', t.id);
    db().run('DELETE FROM study_tasks WHERE id = ?', t.id);
    audit(u.id, 'academics.planner.delete', 'study_task', t.id, {});
  });
  ok(res, { id: t.id, deleted: true });
}));

plannerRouter.get('/planner/emails/:id', h((req, res) => {
  const u = requireUser(req);
  const e = db().get<EmailRow>('SELECT * FROM course_emails WHERE id = ?', req.params.id as string);
  if (!e) throw notFound('Message not found');
  const enrolled = !!db().get("SELECT 1 FROM transcript_entries WHERE student_id = ? AND course_code = ? AND term = ? AND status = 'enrolled' AND (? IS NULL OR section_id = ?)", u.id, e.course_code, e.term, e.section_id, e.section_id);
  if (!enrolled && !hasRole(u, 'reviewer', 'registrar')) throw notFound('Message not found');
  ok(res, { ...e, assessment: e.assessment_id ? db().get('SELECT * FROM course_assessments WHERE id = ?', e.assessment_id) : null });
}));

/** Demo only: play the part of a professor and send an announcement to a course. */
plannerRouter.post('/planner/demo/email', h((req, res) => {
  requireUser(req);
  if (!config.demoMode) throw forbidden('Only available in demo mode');
  const b = parse(z.object({ course_code: z.string().min(3).max(12), subject: z.string().trim().min(3).max(200), body: z.string().trim().min(5).max(4000), from_name: z.string().trim().max(80).optional() }), req.body);
  const sec = db().get<{ instructor: string }>('SELECT instructor FROM course_sections WHERE course_code = ? AND term = ? ORDER BY section_no LIMIT 1', b.course_code, CURRENT_TERM);
  if (!sec) throw unprocessable('No section of that course runs this term');
  const name = b.from_name || sec.instructor;
  const r = db().tx(() => ingestCourseEmail(db(), { course_code: b.course_code, from_name: name, from_email: demoAddress(name), subject: b.subject, body: b.body }, { today: todayIso() }));
  ok(res, { email_id: r.email.id, scheduled: !!r.assessment, recipients: r.recipients, note: r.email.parse_note, assessment: r.assessment }, 201);
}));

// ------------------------------------------------------------------ seed and migration
/** Professors' announcements for the demo term, written like real course emails. */
export function seedPlanner(d: Db, today = todayIso()) {
  const at = (days: number, time: string) => new Date(localToIso(addDays(today, days), time)).toISOString();
  const mail = (id: string, sectionId: string, subject: string, body: string, days: number, time: string, source = 'email') => {
    const s = d.get<{ instructor: string; course_code: string }>('SELECT instructor, course_code FROM course_sections WHERE id = ?', sectionId);
    if (!s) return;
    // Older announcements were read long ago; only the last two days still show up as new notifications.
    ingestCourseEmail(d, { id, course_code: s.course_code, section_id: sectionId, from_name: s.instructor, from_email: demoAddress(s.instructor), subject, body, source, received_at: at(days, time) }, { today: addDays(today, days), notify: days >= -2 });
  };
  const sec = (code: string) => `sec_${CURRENT_TERM}_${code}`;
  mail('cem_seed_cis321_q2', sec('cis321_01'), 'Quiz 2 on Tuesday 6 October', 'Dear students,\n\nQuiz 2 will be held on Tuesday 6 October at 11:00 in E203. It covers chapters 4 and 5 (CPU scheduling and process synchronisation). It is 30 minutes and closed book. Please bring your student ID.\n\nBest regards,\nDr. Khalid', -2, '14:10');
  mail('cem_seed_swe302_mid', sec('swe302_01'), 'Midterm exam: Software Architecture', 'Hello everyone,\n\nThe midterm exam is on Thursday 8 October from 4:00 to 5:30 pm in G105. It covers lectures 1 to 6: quality attributes, architectural styles, and the layered and hexagonal case studies. One A4 page of handwritten notes is allowed.', -3, '09:30');
  mail('cem_seed_swe312_a2', sec('swe312_01'), 'Assignment 2: UI prototype due Monday 5 October', 'Submit your Figma prototype link and a one-page design rationale on the LMS by Monday 5 October at 11:59 pm. Late submissions lose 10% per day.', -4, '16:00', 'lms');
  mail('cem_seed_swe322_lab3', sec('swe322_01'), 'موعد تسليم تقرير المعمل 3', 'الأعزاء الطلاب،\n\nآخر موعد لتسليم تقرير المعمل رقم 3 (واجهة REST API) هو يوم الأحد 4 أكتوبر الساعة 10 مساءً عبر نظام التعلم الإلكتروني. أرفقوا لقطات شاشة لنتائج الاختبارات.', -1, '19:45');
  mail('cem_seed_cis316_proj', sec('cis316_01'), 'AI project proposal (teams of three)', 'Your AI project proposal (two pages maximum) is due Wednesday 30 September at 5 pm. Include the problem, the dataset, and the search or learning approach you plan to use.', -5, '11:20');
  mail('cem_seed_swe302_oh', sec('swe302_01'), 'Office hours this week', 'Office hours move to Monday 12:30 in my office (B-214) this week only. Drop by with questions about the case studies.', -1, '08:00');
  // Layan and Faisal get their own announcements.
  mail('cem_seed_swe411_q1', sec('swe411_01'), 'Quiz 1 next Wednesday', 'Quiz 1 is on Wednesday 30 September at 2:30 pm in E203, in the first 30 minutes of class. Topics: test design techniques and coverage criteria.', -2, '10:00');
  mail('cem_seed_cis202_q2', sec('cis202_K1'), 'اختبار قصير رقم 2', 'سيكون الاختبار القصير رقم 2 يوم الخميس 1 أكتوبر الساعة 10 صباحًا في القاعة E-205. يغطي القوائم المترابطة والمكدسات.', -1, '12:00');
}

registerMigration({ id: 'planner-v1', description: 'professor announcements and automatic assessment to-dos for the study planner', run: (d) => seedPlanner(d) });

