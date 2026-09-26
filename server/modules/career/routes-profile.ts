import { Router } from 'express';
import { z } from 'zod';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { getProfile, normSkill, rowToOpportunity, type ApplicationRow, type OpportunityRow } from './shared.ts';
import { matchOpportunity } from './match.ts';
import { listApplicationsFor } from './applications.ts';
import { decorate } from './routes-opportunities.ts';

export const profileRouter = Router();

profileRouter.get('/profile', h((req, res) => {
  const u = requireUser(req);
  ok(res, { profile: getProfile(u), user: { id: u.id, name_en: u.name_en, name_ar: u.name_ar, email: u.email, stage: u.stage, level: u.level, program_id: u.program_id, campus_id: u.campus_id, interests: u.interests, skills: u.skills } });
}));

profileRouter.put('/profile', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({
    headline: z.string().max(140).optional(), summary: z.string().max(2000).optional(), skills: z.array(z.string().min(1).max(40)).max(40).optional(),
    links: z.record(z.string(), z.string().max(300)).optional(), availability: z.string().max(120).optional(),
    cv_versions: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).max(120), updated_at: z.string() })).max(20).optional()
  }), req.body);
  const cur = getProfile(u);
  const next = { ...cur, ...body, skills: body.skills ? [...new Set(body.skills.map((s) => s.trim()).filter(Boolean))] : cur.skills, updated_at: nowIso() };
  db().upsert('career_profiles', { student_id: u.id, headline: next.headline, summary: next.summary, skills: j(next.skills), links: j(next.links), cv_versions: j(next.cv_versions), availability: next.availability, updated_at: next.updated_at });
  audit(u.id, 'career.profile.update', 'career_profile', u.id, { fields: Object.keys(body) });
  ok(res, { profile: getProfile(u) });
}));

profileRouter.post('/profile/cv', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ label: z.string().min(1).max(120) }), req.body);
  const cur = getProfile(u);
  const v = { id: `cv-${newId('v', 4).slice(2)}`, label: body.label, updated_at: nowIso() };
  db().upsert('career_profiles', { student_id: u.id, headline: cur.headline, summary: cur.summary, skills: j(cur.skills), links: j(cur.links), cv_versions: j([...cur.cv_versions, v]), availability: cur.availability, updated_at: nowIso() });
  ok(res, { profile: getProfile(u), version: v }, 201);
}));

interface EventRow { id: string; title_en: string; title_ar: string; start_at: string; tags: string; kind: string }

/** Missing skills across saved/tracked opportunities, with workshop links (campus events by tag) and study-task shortcuts. */
profileRouter.get('/skill-gaps', h((req, res) => {
  const u = requireUser(req);
  const profile = getProfile(u);
  const savedIds = db().all<{ opportunity_id: string }>('SELECT opportunity_id FROM saved_opportunities WHERE user_id = ?', u.id).map((r) => r.opportunity_id);
  const appIds = db().all<ApplicationRow>('SELECT opportunity_id FROM applications WHERE student_id = ? AND opportunity_id IS NOT NULL', u.id).map((r) => r.opportunity_id as string);
  const ids = [...new Set([...savedIds, ...appIds])];
  const rows = ids.length ? db().all<OpportunityRow>(`SELECT * FROM opportunities WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
  const today = todayIso();
  const gaps = new Map<string, { skill: string; opportunities: Array<{ id: string; title: string; company: string }> }>();
  for (const r of rows) {
    const o = rowToOpportunity(r, today);
    const m = matchOpportunity(o, u, profile);
    for (const s of m.missing) {
      const key = normSkill(s);
      if (!gaps.has(key)) gaps.set(key, { skill: s, opportunities: [] });
      gaps.get(key)!.opportunities.push({ id: o.id, title: o.title, company: o.company });
    }
  }
  const events = db().all<EventRow>(`SELECT id, title_en, title_ar, start_at, tags, kind FROM events WHERE start_at >= ? AND status = 'scheduled' ORDER BY start_at`, nowIso());
  const tasks = db().all<{ id: string; notes: string; status: string }>(`SELECT id, notes, status FROM study_tasks WHERE student_id = ? AND notes LIKE 'skill gap:%'`, u.id);
  const items = [...gaps.values()].map((g) => {
    const key = normSkill(g.skill);
    const workshops = events.filter((e) => { const tags = pj<string[]>(e.tags, []).map((t) => t.toLowerCase()); const title = e.title_en.toLowerCase(); return tags.some((t) => t.includes(key) || key.includes(t)) || title.includes(key); }).slice(0, 3).map((e) => ({ id: e.id, title_en: e.title_en, title_ar: e.title_ar, start_at: e.start_at, link: `/campus/events/${e.id}` }));
    const task = tasks.find((t) => normSkill(t.notes.replace(/^skill gap:\s*/i, '')) === key) ?? null;
    return { ...g, workshops, task: task ? { id: task.id, status: task.status, link: '/academics/study' } : null };
  }).sort((a, b) => b.opportunities.length - a.opportunities.length);
  ok(res, { items, basis: { saved: savedIds.length, tracked: appIds.length } });
}));

profileRouter.post('/skill-gaps/task', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ skill: z.string().min(1).max(60), effort_min: z.number().int().min(15).max(600).optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable() }), req.body);
  const key = normSkill(body.skill);
  const existing = db().all<{ id: string; notes: string }>(`SELECT id, notes FROM study_tasks WHERE student_id = ? AND notes LIKE 'skill gap:%' AND status != 'done'`, u.id).find((t) => normSkill(t.notes.replace(/^skill gap:\s*/i, '')) === key);
  if (existing) { ok(res, { task: db().get('SELECT * FROM study_tasks WHERE id = ?', existing.id), created: false }); return; }
  const id = newId('task');
  const now = nowIso();
  db().insert('study_tasks', { id, student_id: u.id, course_code: null, title: `Practice ${body.skill} (skill gap)`, effort_min: body.effort_min ?? 90, deadline: body.deadline ?? null, scheduled_date: null, locked: 0, status: 'todo', progress: 0, actual_min: 0, source: 'manual', resource_id: null, event_id: null, notes: `skill gap: ${body.skill}`, priority: 2, history: j([{ at: now, action: 'created', source: 'career.skill-gap' }]), created_at: now, updated_at: now, completed_at: null });
  audit(u.id, 'career.skillgap.task', 'study_task', id, { skill: body.skill });
  ok(res, { task: db().get('SELECT * FROM study_tasks WHERE id = ?', id), created: true }, 201);
}));

/** Graduation → career handoff: applications summary, suggested opportunities and a readiness checklist. */
profileRouter.get('/handoff', h((req, res) => {
  const u = requireUser(req);
  const profile = getProfile(u);
  const apps = listApplicationsFor(u.id);
  const byStatus: Record<string, number> = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const suggested = decorate(db().all<OpportunityRow>(`SELECT * FROM opportunities WHERE type IN ('entry','coop') AND status != 'expired'`), u.id).filter((o) => !o.expired && !o.applicationId).sort((a, b) => b.match.score - a.match.score).slice(0, 4);
  const coop = db().get<{ status: string; term: string }>(`SELECT status, term FROM transcript_entries WHERE student_id = ? AND course_code = 'CIS 490' ORDER BY CASE status WHEN 'completed' THEN 0 WHEN 'equivalent' THEN 0 WHEN 'enrolled' THEN 1 ELSE 2 END LIMIT 1`, u.id);
  const latestCv = [...profile.cv_versions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const cvFresh = !!latestCv && new Date(latestCv.updated_at).getTime() >= new Date(nowIso()).getTime() - 120 * 86400000;
  const gradReq = db().get<{ status: string; receipt: string | null }>('SELECT status, receipt FROM graduation_requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', u.id);
  const checklist = [
    { key: 'cv_updated', label_en: 'CV updated in the last 4 months', label_ar: 'تحديث السيرة الذاتية خلال آخر 4 أشهر', done: cvFresh, detail: latestCv?.label ?? 'No CV version recorded', link: '/portfolio' },
    { key: 'linkedin', label_en: 'LinkedIn profile linked', label_ar: 'ربط حساب لينكدإن', done: !!profile.links.linkedin, detail: profile.links.linkedin ?? '', link: '/portfolio' },
    { key: 'github', label_en: 'Portfolio / GitHub linked', label_ar: 'ربط معرض الأعمال / GitHub', done: !!(profile.links.github || profile.links.portfolio), detail: profile.links.github ?? profile.links.portfolio ?? '', link: '/portfolio' },
    { key: 'coop_evidence', label_en: 'Co-op (CIS 490) evidence on the transcript', label_ar: 'إثبات التدريب التعاوني (CIS 490) في السجل', done: !!coop && (coop.status === 'completed' || coop.status === 'equivalent'), detail: coop ? `${coop.status} (${coop.term})` : 'Not on transcript', link: '/journey/graduation' },
    { key: 'active_application', label_en: 'At least one active graduate application', label_ar: 'طلب توظيف نشط واحد على الأقل', done: apps.some((a) => !a.terminal && a.type === 'entry'), detail: `${apps.filter((a) => !a.terminal).length} active`, link: '/career?tab=tracker' }
  ];
  ok(res, { stage: u.stage, applications: { total: apps.length, byStatus, active: apps.filter((a) => !a.terminal).slice(0, 5) }, suggested, checklist, graduation: gradReq ? { status: gradReq.status, receipt: pj(gradReq.receipt, null) } : null, profile });
}));
