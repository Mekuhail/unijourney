import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../core/db.ts';
import { h, ok, parse } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { aiAvailable, aiJson } from '../../adapters/ai.ts';
import { APP_STATUSES, getProfile, normalizeUrl, rowToOpportunity, type OpportunityRow } from './shared.ts';
import { addInterview, applicationSummary, createApplication, deleteInterview, listApplicationsFor, listEvents, listInterviews, requireOwnedApplication, transitionApplication } from './applications.ts';
import { listEmails } from './emails.ts';

export const applicationsRouter = Router();

applicationsRouter.get('/applications', h((req, res) => {
  const u = requireUser(req);
  ok(res, { items: listApplicationsFor(u.id), statuses: APP_STATUSES });
}));

applicationsRouter.post('/applications', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ opportunityId: z.string().optional().nullable(), company: z.string().max(200).optional(), title: z.string().max(200).optional(), url: z.string().max(500).optional().nullable(), type: z.enum(['internship', 'coop', 'entry', 'research', 'competition']).optional() }), req.body);
  const { application, duplicate } = createApplication(u, body);
  ok(res, { ...applicationSummary(application), duplicate }, duplicate ? 200 : 201);
}));

applicationsRouter.get('/applications/:id', h((req, res) => {
  const u = requireUser(req);
  const app = requireOwnedApplication(u, req.params.id as string);
  const emails = listEmails(u.id).filter((e) => e.suggested_application_id === app.id || e.matched_by.candidates.includes(app.id));
  ok(res, { ...applicationSummary(app), events: listEvents(app.id), interviews: listInterviews(app.id), emails, profile: getProfile(u) });
}));

applicationsRouter.put('/applications/:id', h((req, res) => {
  const u = requireUser(req);
  const app = requireOwnedApplication(u, req.params.id as string);
  const body = parse(z.object({ notes: z.string().max(4000).optional(), cv_version: z.string().max(80).nullable().optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), url: z.string().max(500).nullable().optional(), title: z.string().min(1).max(200).optional(), company: z.string().min(1).max(200).optional() }), req.body);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  for (const k of ['notes', 'cv_version', 'deadline', 'title', 'company'] as const) if (body[k] !== undefined) patch[k] = body[k];
  if (body.url !== undefined) { patch.url = body.url; patch.normalized_url = normalizeUrl(body.url); }
  db().update('applications', app.id, patch);
  ok(res, applicationSummary(requireOwnedApplication(u, app.id)));
}));

applicationsRouter.post('/applications/:id/status', h((req, res) => {
  const u = requireUser(req);
  const app = requireOwnedApplication(u, req.params.id as string);
  const body = parse(z.object({ status: z.enum(APP_STATUSES), note: z.string().max(1000).optional().nullable(), attest: z.boolean().optional(), correction: z.boolean().optional() }), req.body);
  const r = transitionApplication(app, { ...body, actorId: u.id });
  ok(res, { ...applicationSummary(r.application), event: r.event });
}));

applicationsRouter.post('/applications/:id/interviews', h((req, res) => {
  const u = requireUser(req);
  const app = requireOwnedApplication(u, req.params.id as string);
  const body = parse(z.object({ start_at: z.string().min(10), end_at: z.string().min(10), location: z.string().max(200).optional().nullable(), link: z.string().max(500).optional().nullable(), kind: z.string().max(40).optional(), notes: z.string().max(1000).optional().nullable(), advance: z.boolean().optional() }), req.body);
  const r = addInterview(u, app, body, body.advance ?? false);
  ok(res, { interview: r.interview, conflicts: r.conflicts, statusChanged: r.statusChanged, application: applicationSummary(requireOwnedApplication(u, app.id)) }, 201);
}));

applicationsRouter.delete('/interviews/:id', h((req, res) => {
  const u = requireUser(req);
  deleteInterview(u, req.params.id as string);
  ok(res, { deleted: true });
}));

/** Autofill draft: profile → typical application fields + a templated cover note. Nothing is submitted anywhere. */
applicationsRouter.post('/applications/:id/prepare', h(async (req, res) => {
  const u = requireUser(req);
  const app = requireOwnedApplication(u, req.params.id as string);
  const profile = getProfile(u);
  const opp = app.opportunity_id ? db().get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', app.opportunity_id) : undefined;
  const o = opp ? rowToOpportunity(opp, todayIso()) : null;
  const latestCv = [...profile.cv_versions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const skills = [...new Set([...profile.skills, ...u.skills])];
  const relevant = o ? skills.filter((s) => o.skills.map((x) => x.toLowerCase()).includes(s.toLowerCase())) : skills.slice(0, 4);
  const fields = {
    full_name: u.name_en, email: u.email, phone: '', university: 'Al Yamamah University', program: u.program_id ? u.program_id.toUpperCase() : '', level: u.level, student_no: u.student_no ?? '',
    expected_graduation: u.stage === 'graduating' ? 'Spring 2027' : profile.availability || '', availability: profile.availability, headline: profile.headline, summary: profile.summary,
    skills: skills.join(', '), linkedin: profile.links.linkedin ?? '', github: profile.links.github ?? '', portfolio: profile.links.portfolio ?? '', cv_version: latestCv?.label ?? '', position: app.title, company: app.company, source_url: app.url ?? ''
  };
  const template = [
    `Dear ${app.company} hiring team,`,
    '',
    `I am writing to apply for the ${app.title} position. I am a ${u.stage === 'graduating' ? 'graduating' : `level ${u.level}`} ${u.program_id === 'bcne' ? 'Computer Network Engineering' : 'Software Engineering'} student at Al Yamamah University${profile.headline ? ` (${profile.headline.toLowerCase()})` : ''}.`,
    '',
    relevant.length ? `The role asks for ${o?.skills.slice(0, 4).join(', ') ?? 'skills'}; I have hands-on experience with ${relevant.join(', ')} from coursework and projects.${profile.summary ? ` ${profile.summary.split('. ')[0]}.` : ''}` : (profile.summary || 'I have hands-on experience from coursework and projects.'),
    '',
    o?.description ? `What draws me to this opportunity: ${o.description.split('. ')[0]}.` : `I am keen to contribute to ${app.company} and to learn from your team.`,
    profile.availability ? `Availability: ${profile.availability}.` : '',
    '',
    'Thank you for considering my application.',
    u.name_en
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
  let cover = template;
  let provider: 'template' | 'anthropic' = 'template';
  if (aiAvailable()) {
    const r = await aiJson<{ cover_note: string }>('You polish a short cover note for a university student. Keep every fact exactly as given; never add skills, experience or claims that are not in the input. Return {"cover_note": string}.', JSON.stringify({ draft: template, role: app.title, company: app.company }), 8000);
    if (r.data?.cover_note && r.data.cover_note.length > 50) { cover = r.data.cover_note; provider = 'anthropic'; }
  }
  ok(res, { label: 'Draft for your review — nothing is submitted externally', simulated: true, provider, fields, cover_note: cover, missing_skills: o ? o.skills.filter((s) => !skills.map((x) => x.toLowerCase()).includes(s.toLowerCase())) : [], generated_at: nowIso() });
}));
