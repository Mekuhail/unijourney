import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, bad, notFound } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { fetchGithubSummary, parseGithubUsername, type GithubSummary } from '../../adapters/github.ts';
import { getProfile, type CareerProfile } from './shared.ts';
import { COURSE_SKILLS, EVIDENCE_WEIGHT, courseWeight, skillDef, skillKey, type EvidenceKind } from './skills.ts';

/*
 * Student portfolio: items (projects, experience, certificates, awards, volunteering, languages) with a source and a
 * verification level, linked LinkedIn/GitHub accounts, per-purpose consent, and evidence-weighted skills.
 *
 * LinkedIn: only the public profile URL is stored, "Verify with LinkedIn" is simulated (the real OpenID Connect product
 * returns name/email/photo only), and profile data arrives through the member's own data export, parsed in the browser
 * and reviewed item by item before anything is saved. GitHub: real public REST API, summary cached here, no tokens.
 */

export const ITEM_KINDS = ['project', 'experience', 'certificate', 'award', 'volunteer', 'language', 'education'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const VISIBILITY = ['private', 'staff', 'employers'] as const;
/** matching: portfolio items and GitHub count as evidence when ranking opportunities. staff_view: YU career staff may see items marked Staff or Employers. */
export const CONSENT_PURPOSES = ['matching', 'staff_view'] as const;

export interface PortfolioItemRow {
  id: string; student_id: string; kind: ItemKind; title: string; org: string; start_date: string | null; end_date: string | null; description: string;
  url: string | null; credential_id: string | null; skills: string; source: string; source_ref: string | null; verification: string; visibility: string; created_at: string; updated_at: string;
}
export interface PortfolioItem extends Omit<PortfolioItemRow, 'skills'> { skills: string[] }
export interface Account { provider: 'linkedin' | 'github'; handle: string; url: string; verified: boolean; method: string; last_synced_at: string | null; data: GithubSummary | null; error: string | null }

const rowToItem = (r: PortfolioItemRow): PortfolioItem => ({ ...r, skills: pj<string[]>(r.skills, []) });

export function listItems(studentId: string): PortfolioItem[] {
  return db().all<PortfolioItemRow>(`SELECT * FROM portfolio_items WHERE student_id = ? ORDER BY CASE kind WHEN 'award' THEN 0 WHEN 'experience' THEN 1 WHEN 'project' THEN 2 WHEN 'certificate' THEN 3 ELSE 4 END, COALESCE(end_date, start_date, created_at) DESC`, studentId).map(rowToItem);
}

export function listAccounts(studentId: string): Account[] {
  return db().all(`SELECT * FROM external_accounts WHERE student_id = ?`, studentId).map((r) => ({ provider: r.provider, handle: r.handle, url: r.url, verified: !!r.verified, method: r.method, last_synced_at: r.last_synced_at, data: pj<GithubSummary | null>(r.data, null), error: r.error ?? null }));
}

export function consents(studentId: string): Record<string, { granted: boolean; at: string | null }> {
  const rows = db().all<{ purpose: string; granted_at: string | null; withdrawn_at: string | null }>('SELECT purpose, granted_at, withdrawn_at FROM portfolio_consents WHERE student_id = ?', studentId);
  const out: Record<string, { granted: boolean; at: string | null }> = {};
  for (const p of CONSENT_PURPOSES) {
    const r = rows.find((x) => x.purpose === p);
    out[p] = { granted: !!r?.granted_at && !r.withdrawn_at, at: r?.withdrawn_at ?? r?.granted_at ?? null };
  }
  return out;
}

const GITHUB_LANGUAGE_SKILL: Record<string, string> = { javascript: 'javascript', typescript: 'typescript', python: 'python', 'jupyter notebook': 'python', java: 'java', 'c#': 'csharp', 'c++': 'cpp', go: 'go', html: 'html-css', css: 'html-css', shell: 'linux', dockerfile: 'docker' };

export interface SkillEvidence { key: string; label_en: string; label_ar: string; strength: number; evidence: Array<{ kind: EvidenceKind; ref: string; weight: number }> }

/**
 * Every skill the student can show, with its strongest evidence. Self-declared skills and courses always count;
 * portfolio items and GitHub count only while the student's "matching" consent is granted.
 */
export function skillEvidence(user: User, profile: CareerProfile): Map<string, SkillEvidence> {
  const map = new Map<string, SkillEvidence>();
  const add = (label: string, kind: EvidenceKind, ref: string, weight = EVIDENCE_WEIGHT[kind]) => {
    const key = skillKey(label);
    const def = key.startsWith('text:') ? undefined : skillDef(key);
    const cur = map.get(key) ?? { key, label_en: def?.en ?? label, label_ar: def?.ar ?? label, strength: 0, evidence: [] };
    if (!cur.evidence.some((e) => e.kind === kind && e.ref === ref)) cur.evidence.push({ kind, ref, weight });
    cur.strength = Math.max(cur.strength, Math.min(1, weight));
    map.set(key, cur);
  };
  for (const s of new Set([...user.skills, ...profile.skills])) add(s, 'self', 'profile');

  const transcript = db().all<{ course_code: string; status: string; grade: string | null }>(`SELECT course_code, status, grade FROM transcript_entries WHERE student_id = ?`, user.id);
  for (const t of transcript) {
    for (const s of COURSE_SKILLS[t.course_code] ?? []) {
      if (t.status === 'completed' || t.status === 'equivalent') add(s, 'course', t.course_code, courseWeight(t.grade));
      else if (t.status === 'enrolled') add(s, 'course_in_progress', t.course_code);
    }
  }

  const c = consents(user.id);
  if (c.matching.granted) {
    for (const it of listItems(user.id)) {
      const kind: EvidenceKind = it.kind === 'project' ? 'project' : it.kind === 'experience' || it.kind === 'volunteer' ? 'experience' : it.kind === 'certificate' ? 'certificate' : it.kind === 'award' ? (it.verification === 'university' || it.verification === 'issuer' ? 'award_verified' : 'award') : 'self';
      for (const s of it.skills) add(s, kind, it.title);
    }
    const gh = listAccounts(user.id).find((a) => a.provider === 'github' && a.data);
    if (gh?.data) {
      for (const lang of gh.data.languages) {
        const id = GITHUB_LANGUAGE_SKILL[lang.name.toLowerCase()];
        if (id) add(id, 'github', `${gh.data.username} · ${lang.repos} repo${lang.repos === 1 ? '' : 's'}`);
      }
      if (gh.data.repos.length) add('git', 'github', gh.data.username);
    }
  }
  return map;
}

/** Completed credit hours and a 4.0-scale GPA from the transcript (letter grades only). */
export function academicRecord(userId: string): { credits: number; gpa: number | null } {
  const POINTS: Record<string, number> = { 'A+': 4, A: 4, 'A-': 3.75, 'B+': 3.5, B: 3, 'B-': 2.75, 'C+': 2.5, C: 2, 'C-': 1.75, 'D+': 1.5, D: 1, F: 0 };
  const rows = db().all<{ credits: number; grade: string | null; status: string }>(`SELECT COALESCE(c.credits, 3) AS credits, t.grade, t.status FROM transcript_entries t LEFT JOIN (SELECT code, MAX(credits) AS credits FROM courses GROUP BY code) c ON c.code = t.course_code WHERE t.student_id = ? AND t.status IN ('completed','equivalent')`, userId);
  let credits = 0, pts = 0, graded = 0;
  for (const r of rows) {
    credits += Number(r.credits);
    if (r.grade && POINTS[r.grade] !== undefined) { pts += POINTS[r.grade] * Number(r.credits); graded += Number(r.credits); }
  }
  return { credits, gpa: graded ? Math.round((pts / graded) * 100) / 100 : null };
}

export const portfolioRouter = Router();

const itemBody = z.object({
  kind: z.enum(ITEM_KINDS), title: z.string().trim().min(1).max(160), org: z.string().trim().max(160).default(''),
  start_date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).nullable().optional(), end_date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).nullable().optional(),
  description: z.string().max(2000).default(''), url: z.string().url().max(400).nullable().optional(), credential_id: z.string().max(120).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]), visibility: z.enum(VISIBILITY).default('private')
});

function insertItem(u: User, body: z.infer<typeof itemBody>, source: string, verification: string, sourceRef: string | null = null): PortfolioItem {
  const id = newId('pf');
  const now = nowIso();
  db().insert('portfolio_items', { id, student_id: u.id, kind: body.kind, title: body.title, org: body.org, start_date: body.start_date ?? null, end_date: body.end_date ?? null, description: body.description, url: body.url ?? null, credential_id: body.credential_id ?? null, skills: j([...new Set(body.skills)]), source, source_ref: sourceRef, verification, visibility: body.visibility, created_at: now, updated_at: now });
  return rowToItem(db().get<PortfolioItemRow>('SELECT * FROM portfolio_items WHERE id = ?', id)!);
}

portfolioRouter.get('/portfolio', h((req, res) => {
  const u = requireUser(req);
  const profile = getProfile(u);
  const skills = [...skillEvidence(u, profile).values()].sort((a, b) => b.strength - a.strength || a.label_en.localeCompare(b.label_en));
  const program = u.program_id ? db().get('SELECT id, code, name_en, name_ar, degree, total_credits FROM programs WHERE id = ?', u.program_id) : null;
  const record = academicRecord(u.id);
  const courses = db().all<{ course_code: string; status: string; grade: string | null; title_en: string; title_ar: string }>(`SELECT t.course_code, t.status, t.grade, COALESCE(c.title_en, t.course_code) AS title_en, COALESCE(c.title_ar, '') AS title_ar FROM transcript_entries t LEFT JOIN (SELECT code, MAX(title_en) AS title_en, MAX(title_ar) AS title_ar FROM courses GROUP BY code) c ON c.code = t.course_code WHERE t.student_id = ? AND t.status IN ('completed','equivalent','enrolled') ORDER BY t.status DESC, t.course_code`, u.id)
    .filter((c) => COURSE_SKILLS[c.course_code]).map((c) => ({ ...c, skills: COURSE_SKILLS[c.course_code] }));
  const items = listItems(u.id);
  const accounts = listAccounts(u.id);
  const checks = [
    { key: 'headline', done: !!profile.headline },
    { key: 'summary', done: profile.summary.length >= 60 },
    { key: 'linkedin', done: accounts.some((a) => a.provider === 'linkedin') || !!profile.links.linkedin },
    { key: 'github', done: accounts.some((a) => a.provider === 'github' && !!a.data) },
    { key: 'projects', done: items.filter((i) => i.kind === 'project').length >= 2 },
    { key: 'experience', done: items.some((i) => i.kind === 'experience' || i.kind === 'volunteer') },
    { key: 'awards', done: items.some((i) => i.kind === 'award' || i.kind === 'certificate') },
    { key: 'evidence', done: skills.filter((s) => s.strength >= 0.6).length >= 5 }
  ];
  ok(res, {
    profile, items, accounts, consents: consents(u.id), skills,
    education: { program, level: u.level, stage: u.stage, credits: record.credits, gpa: record.gpa, courses },
    completeness: { done: checks.filter((c) => c.done).length, total: checks.length, checks }
  });
}));

portfolioRouter.post('/portfolio/items', h((req, res) => {
  const u = requireUser(req);
  const body = parse(itemBody, req.body);
  const item = insertItem(u, body, 'manual', body.url ? 'link' : 'self');
  audit(u.id, 'career.portfolio.item.create', 'portfolio_item', item.id, { kind: item.kind });
  ok(res, { item }, 201);
}));

portfolioRouter.patch('/portfolio/items/:id', h((req, res) => {
  const u = requireUser(req);
  const cur = db().get<PortfolioItemRow>('SELECT * FROM portfolio_items WHERE id = ? AND student_id = ?', String(req.params.id), u.id);
  if (!cur) throw notFound('Portfolio item not found');
  const body = parse(itemBody.partial(), req.body);
  const patch: Record<string, unknown> = { ...body, updated_at: nowIso() };
  if (body.skills) patch.skills = j([...new Set(body.skills)]);
  // University-verified items keep their facts; the student may only change visibility and description.
  if (cur.verification === 'university') for (const k of ['title', 'org', 'start_date', 'end_date', 'kind', 'credential_id']) delete patch[k];
  db().update('portfolio_items', cur.id, patch);
  audit(u.id, 'career.portfolio.item.update', 'portfolio_item', cur.id, { fields: Object.keys(body) });
  ok(res, { item: rowToItem(db().get<PortfolioItemRow>('SELECT * FROM portfolio_items WHERE id = ?', cur.id)!) });
}));

portfolioRouter.delete('/portfolio/items/:id', h((req, res) => {
  const u = requireUser(req);
  const cur = db().get<PortfolioItemRow>('SELECT id FROM portfolio_items WHERE id = ? AND student_id = ?', String(req.params.id), u.id);
  if (!cur) throw notFound('Portfolio item not found');
  db().run('DELETE FROM portfolio_items WHERE id = ?', cur.id);
  audit(u.id, 'career.portfolio.item.delete', 'portfolio_item', cur.id, {});
  ok(res, { deleted: true });
}));

/** Items the student reviewed and accepted from their LinkedIn data export (parsed in the browser; the ZIP never uploads). */
portfolioRouter.post('/portfolio/import/linkedin', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ items: z.array(itemBody.extend({ source_ref: z.string().max(200).optional() })).max(200), headline: z.string().max(140).optional(), summary: z.string().max(2000).optional() }), req.body);
  const existing = new Set(db().all<{ source_ref: string }>(`SELECT source_ref FROM portfolio_items WHERE student_id = ? AND source = 'linkedin_export' AND source_ref IS NOT NULL`, u.id).map((r) => r.source_ref));
  let added = 0, skipped = 0;
  db().tx(() => {
    for (const it of body.items) {
      const ref = it.source_ref ?? `${it.kind}:${it.title}:${it.org}:${it.start_date ?? ''}`.toLowerCase();
      if (existing.has(ref)) { skipped++; continue; }
      insertItem(u, it, 'linkedin_export', it.url ? 'link' : 'self', ref);
      existing.add(ref);
      added++;
    }
    if (body.headline || body.summary) {
      const p = getProfile(u);
      db().upsert('career_profiles', { student_id: u.id, headline: body.headline || p.headline, summary: body.summary || p.summary, skills: j(p.skills), links: j(p.links), cv_versions: j(p.cv_versions), availability: p.availability, updated_at: nowIso() });
    }
  });
  audit(u.id, 'career.portfolio.import.linkedin', 'career_profile', u.id, { added, skipped });
  ok(res, { added, skipped });
}));

const LINKEDIN_URL = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{3,100})\/?(?:\?.*)?$/i;

export function parseLinkedinUrl(input: string): { url: string; handle: string } | null {
  const s = input.trim();
  const m = s.match(LINKEDIN_URL) ?? `https://${s}`.match(LINKEDIN_URL);
  return m ? { url: `https://www.linkedin.com/in/${m[1]}`, handle: decodeURIComponent(m[1]) } : null;
}

portfolioRouter.put('/portfolio/accounts/linkedin', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ url: z.string().min(3).max(300) }), req.body);
  const li = parseLinkedinUrl(body.url);
  if (!li) throw bad('Enter a public profile address such as https://www.linkedin.com/in/your-name');
  db().upsert('external_accounts', { student_id: u.id, provider: 'linkedin', handle: li.handle, url: li.url, verified: 0, method: 'url', last_synced_at: null, data: j(null), error: null });
  const p = getProfile(u);
  db().upsert('career_profiles', { student_id: u.id, headline: p.headline, summary: p.summary, skills: j(p.skills), links: j({ ...p.links, linkedin: li.url }), cv_versions: j(p.cv_versions), availability: p.availability, updated_at: nowIso() });
  audit(u.id, 'career.portfolio.account.linkedin', 'external_account', u.id, {});
  ok(res, { accounts: listAccounts(u.id) });
}));

/** "Verify with LinkedIn": simulated OpenID Connect. The real product would only confirm name, email and photo. */
portfolioRouter.post('/portfolio/accounts/linkedin/verify', h((req, res) => {
  const u = requireUser(req);
  const acc = db().get('SELECT * FROM external_accounts WHERE student_id = ? AND provider = ?', u.id, 'linkedin');
  if (!acc) throw bad('Add your LinkedIn profile address first');
  db().run(`UPDATE external_accounts SET verified = 1, method = 'oidc_simulated', last_synced_at = ? WHERE student_id = ? AND provider = 'linkedin'`, nowIso(), u.id);
  audit(u.id, 'career.portfolio.account.verify', 'external_account', u.id, { provider: 'linkedin', simulated: true });
  ok(res, { accounts: listAccounts(u.id), simulated: true });
}));

portfolioRouter.put('/portfolio/accounts/github', h(async (req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ username: z.string().min(1).max(120) }), req.body);
  const username = parseGithubUsername(body.username);
  if (!username) throw bad('Enter a GitHub username or profile address');
  let data: GithubSummary | null = null;
  let error: string | null = null;
  try {
    data = await fetchGithubSummary(username);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  db().upsert('external_accounts', { student_id: u.id, provider: 'github', handle: data?.username ?? username, url: data?.profile_url ?? `https://github.com/${username}`, verified: 0, method: 'public_api', last_synced_at: data ? nowIso() : null, data: j(data), error });
  const p = getProfile(u);
  db().upsert('career_profiles', { student_id: u.id, headline: p.headline, summary: p.summary, skills: j(p.skills), links: j({ ...p.links, github: `https://github.com/${data?.username ?? username}` }), cv_versions: j(p.cv_versions), availability: p.availability, updated_at: nowIso() });
  audit(u.id, 'career.portfolio.account.github', 'external_account', u.id, { ok: !!data });
  ok(res, { accounts: listAccounts(u.id), error });
}));

portfolioRouter.delete('/portfolio/accounts/:provider', h((req, res) => {
  const u = requireUser(req);
  const provider = parse(z.enum(['linkedin', 'github']), req.params.provider);
  db().run('DELETE FROM external_accounts WHERE student_id = ? AND provider = ?', u.id, provider);
  const p = getProfile(u);
  const links = { ...p.links };
  delete links[provider];
  db().upsert('career_profiles', { student_id: u.id, headline: p.headline, summary: p.summary, skills: j(p.skills), links: j(links), cv_versions: j(p.cv_versions), availability: p.availability, updated_at: nowIso() });
  audit(u.id, 'career.portfolio.account.remove', 'external_account', u.id, { provider });
  ok(res, { accounts: listAccounts(u.id) });
}));

portfolioRouter.put('/portfolio/consents', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ purpose: z.enum(CONSENT_PURPOSES), granted: z.boolean() }), req.body);
  const now = nowIso();
  db().upsert('portfolio_consents', { student_id: u.id, purpose: body.purpose, text_version: '2026-09', granted_at: body.granted ? now : null, withdrawn_at: body.granted ? null : now });
  audit(u.id, body.granted ? 'career.portfolio.consent.grant' : 'career.portfolio.consent.withdraw', 'career_profile', u.id, { purpose: body.purpose });
  ok(res, { consents: consents(u.id) });
}));

/** Erase imported data by source (LinkedIn export items, GitHub summary) or everything the student added. */
portfolioRouter.delete('/portfolio/data', h((req, res) => {
  const u = requireUser(req);
  const scope = parse(z.enum(['linkedin_export', 'github', 'all']), req.query.scope);
  db().tx(() => {
    if (scope === 'linkedin_export' || scope === 'all') db().run(`DELETE FROM portfolio_items WHERE student_id = ? AND ${scope === 'all' ? "verification != 'university'" : "source = 'linkedin_export'"}`, u.id);
    if (scope === 'github' || scope === 'all') db().run(`DELETE FROM external_accounts WHERE student_id = ? AND provider = 'github'`, u.id);
    if (scope === 'all') db().run(`DELETE FROM external_accounts WHERE student_id = ?`, u.id);
  });
  audit(u.id, 'career.portfolio.erase', 'career_profile', u.id, { scope });
  ok(res, { erased: scope });
}));

/** JSON Resume 1.0.0 export (https://jsonresume.org/schema). Private items are included: this is the student's own copy. */
portfolioRouter.get('/portfolio/resume.json', h((req, res) => {
  const u = requireUser(req);
  const profile = getProfile(u);
  const items = listItems(u.id);
  const program = u.program_id ? db().get('SELECT name_en, degree FROM programs WHERE id = ?', u.program_id) : null;
  const skills = [...skillEvidence(u, profile).values()].filter((s) => s.strength >= 0.4);
  const accounts = listAccounts(u.id);
  const by = (k: ItemKind) => items.filter((i) => i.kind === k);
  const resume = {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: { name: u.name_en, label: profile.headline, email: u.email, summary: profile.summary, location: { city: u.campus_id === 'khobar' ? 'Al Khobar' : 'Riyadh', countryCode: 'SA' }, profiles: accounts.map((a) => ({ network: a.provider === 'github' ? 'GitHub' : 'LinkedIn', username: a.handle, url: a.url })) },
    work: [...by('experience'), ...by('volunteer')].map((i) => ({ name: i.org, position: i.title, url: i.url ?? undefined, startDate: i.start_date ?? undefined, endDate: i.end_date ?? undefined, summary: i.description || undefined })),
    education: program ? [{ institution: 'Al Yamamah University', area: program.name_en, studyType: program.degree, courses: Object.keys(COURSE_SKILLS) }] : [],
    awards: by('award').map((i) => ({ title: i.title, date: i.end_date ?? i.start_date ?? undefined, awarder: i.org, summary: i.description || undefined })),
    certificates: by('certificate').map((i) => ({ name: i.title, date: i.end_date ?? i.start_date ?? undefined, issuer: i.org, url: i.url ?? undefined })),
    skills: skills.map((s) => ({ name: s.label_en, level: s.strength >= 0.8 ? 'Advanced' : s.strength >= 0.6 ? 'Intermediate' : 'Beginner' })),
    languages: by('language').map((i) => ({ language: i.title, fluency: i.description || undefined })),
    projects: by('project').map((i) => ({ name: i.title, description: i.description || undefined, url: i.url ?? undefined, startDate: i.start_date ?? undefined, endDate: i.end_date ?? undefined, keywords: i.skills })),
    meta: { version: 'v1.0.0', lastModified: nowIso(), canonical: 'UniJourney portfolio export' }
  };
  audit(u.id, 'career.portfolio.export', 'career_profile', u.id, {});
  res.setHeader('content-disposition', 'attachment; filename="resume.json"');
  ok(res, resume);
}));

/** Adds a university-verified award to the student's portfolio (competition results, club recognition). Idempotent per ref. */
export function recordVerifiedAward(studentId: string, a: { title: string; org: string; date: string; description: string; skills: string[]; ref: string; url?: string | null }): string {
  const existing = db().get<{ id: string }>(`SELECT id FROM portfolio_items WHERE student_id = ? AND source = 'university' AND source_ref = ?`, studentId, a.ref);
  const now = nowIso();
  if (existing) {
    db().update('portfolio_items', existing.id, { title: a.title, description: a.description, skills: j(a.skills), end_date: a.date, updated_at: now });
    return existing.id;
  }
  const id = newId('pf');
  db().insert('portfolio_items', { id, student_id: studentId, kind: 'award', title: a.title, org: a.org, start_date: a.date, end_date: a.date, description: a.description, url: a.url ?? null, credential_id: a.ref, skills: j(a.skills), source: 'university', source_ref: a.ref, verification: 'university', visibility: 'employers', created_at: now, updated_at: now });
  return id;
}
