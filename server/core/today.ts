import type { User } from '../../shared/types.ts';
import { db, pj } from './db.ts';
import { addDays, localToIso, now, todayIso, toLocal } from './clock.ts';
import { listEntries } from './calendar.ts';
import { unreadCount } from './notify.ts';
import { getPolicies, CURRENT_TERM, NEXT_TERM, TERM_LABELS } from './settings.ts';
import { hasRole } from './auth.ts';

/** Aggregates the "Today" view across modules by reading shared tables. Everything is scoped to the user. */
export function buildToday(user: User) {
  const d = db();
  const today = todayIso();
  const nowIso = now().toISOString();
  const dayStart = localToIso(today, '00:00');
  const dayEnd = localToIso(addDays(today, 1), '00:00');
  const weekEnd = localToIso(addDays(today, 7), '00:00');
  const todayEntries = listEntries(user.id, dayStart, dayEnd);
  const weekEntries = listEntries(user.id, dayStart, weekEnd);
  const locNames = new Map(d.all('SELECT id, name_en, name_ar, building_id FROM campus_locations').map((r) => [r.id as string, r]));
  const withLoc = (e: (typeof todayEntries)[number]) => ({ ...e, location_name_en: e.location_id ? (locNames.get(e.location_id)?.name_en as string) ?? e.location_text : e.location_text, location_name_ar: e.location_id ? (locNames.get(e.location_id)?.name_ar as string) ?? e.location_text : e.location_text });

  const classes = todayEntries.filter((e) => e.kind === 'class').map(withLoc);
  const nextClass = classes.find((c) => c.end_at > nowIso) ?? null;
  const upcoming = weekEntries.filter((e) => ['event', 'interview', 'exam', 'deadline'].includes(e.kind) && e.end_at > nowIso).slice(0, 8).map(withLoc);

  // `title` stays English for API compatibility; `params` (additive) lets clients render a localized title.
  const pending: Array<{ kind: string; id: string; title: string; status: string; link: string; updated_at: string; params?: Record<string, string | number> }> = [];
  for (const p of d.all(`SELECT id, term, status, credits, updated_at FROM enrollment_proposals WHERE student_id = ? AND status IN ('draft','needs_review','approved','submitting','outcome_unknown','partial') ORDER BY updated_at DESC LIMIT 3`, user.id))
    pending.push({ kind: 'enrollment', id: p.id, title: `Registration proposal · ${TERM_LABELS[p.term as string]?.en ?? p.term} · ${p.credits} cr`, status: p.status, link: `/academics/register?proposal=${p.id}`, updated_at: p.updated_at, params: { term: p.term as string, credits: Number(p.credits) } });
  for (const x of d.all(`SELECT id, type, status, updated_at FROM excuse_requests WHERE student_id = ? AND status IN ('draft','ready','approved','needs_information','outcome_unknown','submitting') ORDER BY updated_at DESC LIMIT 3`, user.id))
    pending.push({ kind: 'excuse', id: x.id, title: `Absence excuse (${x.type})`, status: x.status, link: `/academics/excuses/${x.id}`, updated_at: x.updated_at, params: { type: x.type as string } });
  for (const s of d.all(`SELECT id, kind, status, created_at FROM study_proposals WHERE student_id = ? AND status = 'preview' ORDER BY created_at DESC LIMIT 1`, user.id))
    pending.push({ kind: 'study', id: s.id, title: `Study plan ${s.kind} proposal awaiting your decision`, status: 'preview', link: '/academics/study', updated_at: s.created_at, params: { kind: s.kind as string } });
  for (const a of d.all(`SELECT id, status, updated_at FROM admission_applications WHERE applicant_id = ? AND status IN ('draft','needs_information','admitted') ORDER BY updated_at DESC LIMIT 1`, user.id))
    pending.push({ kind: 'admission', id: a.id, title: a.status === 'admitted' ? 'Admission offer — accept to start orientation' : 'Admission application', status: a.status, link: '/journey/admission', updated_at: a.updated_at });
  for (const g of d.all(`SELECT id, status, created_at FROM graduation_requests WHERE student_id = ? AND status IN ('draft','submitted','under_review') ORDER BY created_at DESC LIMIT 1`, user.id))
    pending.push({ kind: 'graduation', id: g.id, title: 'Graduation request', status: g.status, link: '/journey/graduation', updated_at: g.created_at });
  for (const e of d.all(`SELECT id, subject, created_at FROM hiring_emails WHERE student_id = ? AND review_status = 'pending' ORDER BY received_at DESC LIMIT 2`, user.id))
    pending.push({ kind: 'email', id: e.id, title: `Hiring email needs review: ${e.subject}`, status: 'pending', link: '/career?tab=inbox', updated_at: e.created_at, params: { subject: e.subject as string } });

  const tasks = d.all(`SELECT id, title, course_code, effort_min, deadline, scheduled_date, status, locked, progress FROM study_tasks WHERE student_id = ? AND status != 'done' AND (scheduled_date = ? OR (deadline IS NOT NULL AND deadline <= ?)) ORDER BY COALESCE(scheduled_date, deadline) LIMIT 8`, user.id, today, addDays(today, 7));
  const overdueTasks = d.count('study_tasks', `student_id = ? AND status != 'done' AND deadline IS NOT NULL AND deadline < ?`, user.id, today);

  const absences = d.all(`SELECT course_code, COUNT(*) AS n FROM attendance_records WHERE student_id = ? AND status = 'absent' GROUP BY course_code`, user.id);
  const sessionsTotal = d.all(`SELECT course_code, COUNT(*) AS n FROM attendance_records WHERE student_id = ? GROUP BY course_code`, user.id);
  const pol = getPolicies();
  const attendance = sessionsTotal.map((s) => {
    const abs = Number(absences.find((a) => a.course_code === s.course_code)?.n ?? 0);
    const pct = s.n ? Math.round((abs / Number(s.n)) * 100) : 0;
    return { course_code: s.course_code as string, absences: abs, sessions: Number(s.n), percent: pct, level: pct >= pol.absenceDenialPercent.value ? 'danger' : pct >= pol.absenceWarningPercent.value ? 'warn' : 'ok' };
  }).filter((a) => a.absences > 0);
  const unexcusedAbsences = d.count('attendance_records', `student_id = ? AND status = 'absent' AND excuse_request_id IS NULL`, user.id);

  const lostFound = d.all(`SELECT id, public_id, item, status, collection_location_id, updated_at FROM lost_found_requests WHERE owner_id = ? AND status NOT IN ('collected','closed') ORDER BY updated_at DESC LIMIT 3`, user.id).map((r) => ({ ...r, collection_location_en: r.collection_location_id ? (locNames.get(r.collection_location_id as string)?.name_en as string) ?? null : null, collection_location_ar: r.collection_location_id ? (locNames.get(r.collection_location_id as string)?.name_ar as string) ?? null : null }));
  const applications = d.all(`SELECT id, company, title, status, deadline, updated_at FROM applications WHERE student_id = ? AND status NOT IN ('rejected','withdrawn') ORDER BY updated_at DESC LIMIT 4`, user.id);
  const savedOpps = d.count('saved_opportunities', 'user_id = ?', user.id);
  const clubs = d.all(`SELECT c.id, c.name_en, c.name_ar, m.status FROM memberships m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ? AND m.status IN ('active','pending')`, user.id);
  const credits = d.get<{ earned: number; enrolled: number }>(`SELECT COALESCE(SUM(CASE WHEN status IN ('completed','equivalent') THEN credits END),0) AS earned, COALESCE(SUM(CASE WHEN status = 'enrolled' THEN credits END),0) AS enrolled FROM transcript_entries WHERE student_id = ?`, user.id);

  // Staff queues
  const queues: Array<{ key: string; title: string; count: number; link: string }> = [];
  if (hasRole(user, 'reviewer')) queues.push({ key: 'excuses', title: 'Excuse requests to review', count: d.count('excuse_requests', `status IN ('submitted','under_review')`), link: '/staff/academics/excuses' });
  if (hasRole(user, 'security')) queues.push({ key: 'lostfound', title: 'Open lost & found requests', count: d.count('lost_found_requests', `status IN ('reported','searching','found','ready_for_collection')`), link: '/staff/campus/lost-found' });
  if (hasRole(user, 'admission_officer')) queues.push({ key: 'admissions', title: 'Applications awaiting review', count: d.count('admission_applications', `status IN ('submitted','under_review')`), link: '/staff/journey/admissions' });
  if (hasRole(user, 'registrar')) queues.push({ key: 'graduation', title: 'Graduation requests', count: d.count('graduation_requests', `status IN ('submitted','under_review')`), link: '/staff/journey/graduation' });
  if (hasRole(user, 'reviewer', 'registrar')) queues.push({ key: 'resources', title: 'Resources pending moderation', count: d.count('resources', `status IN ('pending','reported')`), link: '/staff/campus/resources' });
  if (hasRole(user, 'club_lead')) queues.push({ key: 'clubs', title: 'Club join requests', count: d.count('memberships', `status = 'pending' AND club_id IN (SELECT id FROM clubs WHERE lead_id = ?)`, user.id), link: '/staff/campus/clubs' });

  const programRow = user.program_id ? d.get('SELECT * FROM programs WHERE id = ?', user.program_id) : null;

  return {
    today,
    now: nowIso,
    local: toLocal(now()),
    term: { id: CURRENT_TERM, label: TERM_LABELS[CURRENT_TERM], next: NEXT_TERM, nextLabel: TERM_LABELS[NEXT_TERM] },
    user: { id: user.id, stage: user.stage, level: user.level, program: programRow ? { id: programRow.id, name_en: programRow.name_en, name_ar: programRow.name_ar } : null, campus_id: user.campus_id, roles: user.roles },
    stats: { classesToday: classes.length, tasksDue: tasks.length, overdueTasks, pending: pending.length, unread: unreadCount(user.id), creditsEarned: Number(credits?.earned ?? 0), creditsEnrolled: Number(credits?.enrolled ?? 0), unexcusedAbsences, savedOpportunities: savedOpps },
    classes,
    nextClass,
    upcoming,
    pending: pending.sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1)),
    tasks: tasks.map((t) => ({ ...t, locked: !!t.locked })),
    attendance,
    lostFound,
    applications,
    clubs,
    queues,
    week: weekEntries.map(withLoc),
    policies: { absenceWarningPercent: pol.absenceWarningPercent.value, absenceDenialPercent: pol.absenceDenialPercent.value }
  };
}

export type TodayData = ReturnType<typeof buildToday>;
export { pj };
