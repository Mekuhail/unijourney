import { Router } from 'express';
import { z } from 'zod';
import { db, pj } from '../../core/db.ts';
import { addDays, localToIso, todayIso, weekdayOf } from '../../core/clock.ts';
import { h, ok, parse, notFound } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { listEntries } from '../../core/calendar.ts';
import { CURRENT_TERM, NEXT_TERM } from '../../core/settings.ts';
import { computeDegreeAudit } from './audit.ts';
import { COURSE_BY_CODE, PLANS, REQUIREMENTS, prereqRule, programCourseCodes } from './curriculum.ts';
import { enrolledSectionsFor, evaluatePrereqs, listSections, studentContext, termLabel, TERM_DATES } from './common.ts';
import { analyzeEligibility } from './planner.ts';
import { attendanceOverview, listExcuses } from './excuses.ts';
import { listProposals, prereqChain } from './registration.ts';
import { listTasks } from './study.ts';

export const overviewRouter = Router();

export const PROGRAM_NAMES: Record<string, { en: string; ar: string; college_en: string }> = {
  bse: { en: 'B.Sc. Software Engineering', ar: 'بكالوريوس هندسة البرمجيات', college_en: 'College of Engineering & Architecture' },
  bcne: { en: 'B.Sc. Computer Network Engineering', ar: 'بكالوريوس هندسة شبكات الحاسب', college_en: 'College of Engineering & Architecture' }
};

overviewRouter.get('/overview', h((req, res) => {
  const u = requireUser(req);
  const ctx = studentContext(u.id);
  const auditR = computeDegreeAudit(u.id);
  const today = todayIso();
  const weekStart = addDays(today, -weekdayOf(today));
  const entries = listEntries(u.id, localToIso(weekStart, '00:00'), localToIso(addDays(weekStart, 7), '00:00')).filter((e) => e.kind === 'class' || e.kind === 'exam');
  const att = attendanceOverview(u.id, CURRENT_TERM);
  const proposals = listProposals(u.id);
  const excuses = listExcuses(u.id);
  const tasks = listTasks(u.id).filter((t) => t.status !== 'done');
  const dueSoon = tasks.filter((t) => t.deadline && t.deadline >= today && t.deadline <= addDays(today, 7));
  const overdue = tasks.filter((t) => (t.deadline && t.deadline < today) || (t.scheduled_date && t.scheduled_date < today));
  const unexcused = att.courses.flatMap((c) => c.sessions.filter((s) => s.status === 'absent' && !s.excuse_request_id));
  const nextActions: Array<{ kind: string; title: string; body: string; link: string; tone: 'warn' | 'info' | 'danger' | 'success' }> = [];
  const unknown = proposals.find((p) => p.status === 'outcome_unknown');
  if (unknown) nextActions.push({ kind: 'reconcile', title: 'Check a pending registration', body: `Submission ${unknown.operation_id} has an unknown outcome — reconcile before submitting again.`, link: `/academics/register?proposal=${unknown.id}`, tone: 'danger' });
  for (const s of unexcused.slice(0, 2)) nextActions.push({ kind: 'excuse', title: `Excuse the absence on ${s.session_date}`, body: `${s.course_code} · ${s.start_time}–${s.end_time}. Attach a Sehhaty report or event evidence.`, link: `/academics/attendance?session=${s.id}`, tone: 'warn' });
  for (const e of excuses.filter((x) => x.status === 'needs_information')) nextActions.push({ kind: 'excuse_info', title: 'Provide more information for an excuse', body: e.reviewer_note ?? '', link: `/academics/excuses/${e.id}`, tone: 'warn' });
  if (overdue.length) nextActions.push({ kind: 'repair', title: `Repair your study plan (${overdue.length} missed)`, body: overdue.map((t) => t.title).slice(0, 2).join(' · '), link: '/academics/study?repair=1', tone: 'warn' });
  const approvedOrDone = proposals.find((p) => ['approved', 'submitted', 'partial'].includes(p.status) && p.term === NEXT_TERM);
  if (!approvedOrDone && ctx.programId) nextActions.push({ kind: 'plan', title: `Plan ${termLabel(NEXT_TERM).en}`, body: proposals.length ? 'A proposal is waiting for your review.' : 'Registration is open (demo). Generate options that respect prerequisites, seats and your preferences.', link: proposals[0] ? `/academics/register?proposal=${proposals[0].id}` : '/academics/register', tone: 'info' });
  const denial = att.courses.filter((c) => c.level !== 'ok');
  for (const c of denial) nextActions.push({ kind: 'absence', title: `${c.course_code}: absence ${c.absence_percent}%`, body: `${c.level === 'denial' ? 'At or above the denial threshold' : 'Above the warning threshold'} (${c.level === 'denial' ? c.denial_percent : c.warning_percent}%).`, link: '/academics/attendance', tone: c.level === 'denial' ? 'danger' : 'warn' });
  ok(res, {
    student: { id: u.id, name_en: u.name_en, name_ar: u.name_ar, program_id: ctx.programId, program: ctx.programId ? PROGRAM_NAMES[ctx.programId] ?? null : null, level: ctx.level, campus_id: ctx.campusId, student_no: u.student_no },
    term: { id: CURRENT_TERM, label: termLabel(CURRENT_TERM), dates: TERM_DATES[CURRENT_TERM] ?? null, next: { id: NEXT_TERM, label: termLabel(NEXT_TERM), dates: TERM_DATES[NEXT_TERM] ?? null } },
    credits: { earned: auditR.earned, in_progress: auditR.in_progress, required: auditR.total_required, remaining: auditR.remaining, estimate: auditR.estimate },
    week: { start: weekStart, entries },
    attendance: { policy: att.policy, courses: att.courses.map((c) => ({ course_code: c.course_code, title_en: c.title_en, title_ar: c.title_ar, total: c.total, counts: c.counts, absence_percent: c.absence_percent, level: c.level })), unexcused: unexcused.length },
    proposals: { pending: proposals.filter((p) => ['needs_review', 'approved', 'outcome_unknown'].includes(p.status)).length, latest: proposals[0] ?? null },
    excuses: { open: excuses.filter((e) => !['accepted', 'rejected'].includes(e.status)).length, items: excuses.slice(0, 3) },
    tasks: { open: tasks.length, due_soon: dueSoon.length, overdue: overdue.length, next: tasks.filter((t) => t.scheduled_date && t.scheduled_date >= today).slice(0, 3) },
    nextActions
  });
}));

overviewRouter.get('/audit', h((req, res) => {
  const u = requireUser(req);
  ok(res, computeDegreeAudit(u.id));
}));

overviewRouter.get('/plan', h((req, res) => {
  const u = requireUser(req);
  const ctx = studentContext(u.id);
  const programId = ctx.programId ?? 'bse';
  const plan = PLANS[programId] ?? PLANS.bse;
  const best = new Map<string, { status: string; grade: string | null; term: string }>();
  const rank: Record<string, number> = { completed: 4, equivalent: 4, enrolled: 3, planned: 2, failed: 1, withdrawn: 1 };
  for (const t of ctx.transcript) { const prev = best.get(t.course_code); if (!prev || (rank[t.status] ?? 0) > (rank[prev.status] ?? 0)) best.set(t.course_code, { status: t.status, grade: t.grade, term: t.term }); }
  const statusOf = (code: string) => {
    const b = best.get(code);
    if (b && ['completed', 'equivalent', 'enrolled', 'planned'].includes(b.status)) return { status: b.status, grade: b.grade, term: b.term, reasons: [] as string[], in_progress: [] as string[][] };
    const ev = evaluatePrereqs(code, ctx);
    const reasons = ev.missing.map((g) => (g.some((x) => ctx.enrolled.has(x)) ? `${g.join(' or ')} in progress` : `needs ${g.join(' or ')}`));
    if (ev.creditShort > 0) reasons.push(`needs ${prereqRule(code, ctx.programId).min_credits} earned credits`);
    return { status: ev.met ? 'available' : 'blocked', grade: null, term: null as string | null, reasons, in_progress: ev.inProgress };
  };
  const used = new Set<string>();
  const terms = plan.map((t) => ({
    year: t.year, sem: t.sem, label_en: t.label_en, label_ar: t.label_ar,
    courses: t.slots.map((slot) => {
      if (typeof slot === 'string') { const c = COURSE_BY_CODE.get(slot)!; used.add(slot); return { code: slot, title_en: c.title_en, title_ar: c.title_ar, credits: c.credits, category: c.category, elective: null, ...statusOf(slot) }; }
      const pool = (REQUIREMENTS[programId] ?? REQUIREMENTS.bse).find((r) => r.category === (slot.elective === 'hss' ? 'hss_elective' : 'major_elective'))?.course_codes ?? [];
      const taken = pool.find((c) => !used.has(c) && best.has(c) && ['completed', 'equivalent', 'enrolled', 'planned'].includes(best.get(c)!.status));
      if (taken) { used.add(taken); const c = COURSE_BY_CODE.get(taken)!; return { code: taken, title_en: c.title_en, title_ar: c.title_ar, credits: c.credits, category: c.category, elective: slot.elective, slot_label_en: slot.label_en, slot_label_ar: slot.label_ar, ...statusOf(taken) }; }
      const candidates = pool.filter((c) => !used.has(c) && !best.has(c)).map((c) => ({ code: c, ...statusOf(c) })).filter((c) => c.status === 'available').map((c) => c.code);
      return { code: null, title_en: slot.label_en, title_ar: slot.label_ar, credits: 3, category: slot.elective === 'hss' ? 'hss_elective' : 'major_elective', elective: slot.elective, slot_label_en: slot.label_en, slot_label_ar: slot.label_ar, status: candidates.length ? 'available' : 'blocked', grade: null, term: null, reasons: candidates.length ? [] : ['no eligible elective yet'], in_progress: [], candidates };
    })
  }));
  const codes = programCourseCodes(programId);
  const nodes = codes.map((code) => { const c = COURSE_BY_CODE.get(code)!; return { code, title_en: c.title_en, credits: c.credits, level: c.level, category: c.category, status: statusOf(code).status }; });
  const edges: Array<{ from: string; to: string; alt: boolean }> = [];
  for (const code of codes) for (const g of prereqRule(code, ctx.programId).prereqs) for (const p of g) if (codes.includes(p)) edges.push({ from: p, to: code, alt: g.length > 1 });
  ok(res, { program: { id: programId, ...(PROGRAM_NAMES[programId] ?? { en: programId, ar: programId }) }, terms, graph: { nodes, edges }, audit: computeDegreeAudit(u.id), next_term: { id: NEXT_TERM, eligibility: analyzeEligibility(ctx, NEXT_TERM, {}).map((e) => ({ code: e.code, eligible: e.eligible, reasons: e.reasons, required: e.required, sections: e.sections.length })) } });
}));

overviewRouter.get('/timetable', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ term: z.string().optional() }), req.query);
  const term = q.term ?? CURRENT_TERM;
  const sections = enrolledSectionsFor(u.id, term);
  const today = todayIso();
  const terms = [...new Set(db().all<{ term: string }>(`SELECT DISTINCT term FROM transcript_entries WHERE student_id = ? AND status = 'enrolled'`, u.id).map((r) => r.term))].sort();
  ok(res, { term, term_label: termLabel(term), dates: TERM_DATES[term] ?? null, today, weekday: weekdayOf(today), sections, credits: sections.reduce((s, x) => s + x.credits, 0), terms: terms.length ? terms : [CURRENT_TERM] });
}));

overviewRouter.get('/sections', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ term: z.string().optional(), course: z.string().optional(), campus: z.string().optional() }), req.query);
  ok(res, listSections(q.term ?? NEXT_TERM, { course: q.course, campus: q.campus ?? u.campus_id }));
}));

overviewRouter.get('/courses/:code', h((req, res) => {
  const u = requireUser(req);
  const code = decodeURIComponent(req.params.code as string).toUpperCase().replace(/\s+/g, ' ');
  const row = db().get('SELECT * FROM courses WHERE code = ?', code);
  if (!row) throw notFound('Course not found');
  const ctx = studentContext(u.id);
  const rule = prereqRule(code, ctx.programId);
  const dependents = programCourseCodes(ctx.programId ?? 'bse').filter((c) => prereqRule(c, ctx.programId).prereqs.some((g) => g.includes(code)));
  const ev = evaluatePrereqs(code, ctx);
  const status = ctx.completed.has(code) ? (ctx.transcript.find((t) => t.course_code === code && t.status === 'equivalent') ? 'equivalent' : 'completed') : ctx.enrolled.has(code) ? 'enrolled' : ev.met ? 'available' : 'blocked';
  ok(res, {
    course: { ...row, prereqs: pj(row.prereqs, []), coreqs: pj(row.coreqs, []), rule },
    status, missing: ev.missing, in_progress: ev.inProgress, credit_short: ev.creditShort, chain: prereqChain(code, ctx.programId), dependents,
    sections: { current: listSections(CURRENT_TERM, { course: code }), next: listSections(NEXT_TERM, { course: code }) },
    transcript: ctx.transcript.filter((t) => t.course_code === code),
    links: { resources: `/campus/resources?course=${encodeURIComponent(code)}`, register: `/academics/register?course=${encodeURIComponent(code)}` }
  });
}));
