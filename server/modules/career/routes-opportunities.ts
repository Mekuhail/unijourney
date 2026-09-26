import { Router } from 'express';
import { z } from 'zod';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, bad, notFound } from '../../core/http.ts';
import { getUser, requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { nowIso, todayIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { demoOpportunitySource } from '../../adapters/opportunities.ts';
import { getProfile, normalizeUrl, normSkill, rowToOpportunity, urlHash, type ApplicationRow, type Opportunity, type OpportunityRow } from './shared.ts';
import { matchOpportunity } from './match.ts';
import { skillEvidence } from './portfolio.ts';

export const opportunitiesRouter = Router();

const listQuery = z.object({
  q: z.string().optional(), type: z.string().optional(), city: z.string().optional(), remote: z.string().optional(), field: z.string().optional(), skill: z.string().optional(),
  deadlineBefore: z.string().optional(), includeExpired: z.string().optional(), saved: z.string().optional(), sort: z.enum(['match', 'deadline', 'posted']).optional()
});

export function decorate(rows: OpportunityRow[], userId: string) {
  const user = getUser(userId);
  if (!user) throw notFound('User not found');
  const profile = getProfile(user);
  const evidence = skillEvidence(user, profile); // once per request, shared by every posting
  const today = todayIso();
  const saved = new Set(db().all<{ opportunity_id: string }>('SELECT opportunity_id FROM saved_opportunities WHERE user_id = ?', userId).map((r) => r.opportunity_id));
  const apps = new Map(db().all<ApplicationRow>('SELECT id, opportunity_id, status FROM applications WHERE student_id = ? AND opportunity_id IS NOT NULL', userId).map((a) => [a.opportunity_id as string, a]));
  return rows.map((r) => {
    const o = rowToOpportunity(r, today);
    const a = apps.get(o.id);
    return { ...o, match: matchOpportunity(o, user, profile, evidence), saved: saved.has(o.id), applicationId: a?.id ?? null, applicationStatus: a?.status ?? null };
  });
}

opportunitiesRouter.get('/opportunities', h((req, res) => {
  const u = requireUser(req);
  const q = parse(listQuery, req.query);
  const today = todayIso();
  let items = decorate(db().all<OpportunityRow>('SELECT * FROM opportunities ORDER BY posted_at DESC, title'), u.id);
  const includeExpired = q.includeExpired === '1' || q.includeExpired === 'true';
  if (!includeExpired) items = items.filter((o) => !o.expired);
  if (q.type) items = items.filter((o) => o.type === q.type);
  if (q.city) items = items.filter((o) => o.city.toLowerCase() === q.city!.toLowerCase());
  if (q.remote) items = items.filter((o) => o.remote === q.remote);
  if (q.field) items = items.filter((o) => o.field === q.field);
  if (q.skill) { const s = normSkill(q.skill); items = items.filter((o) => o.skills.some((k) => normSkill(k) === s)); }
  if (q.deadlineBefore) items = items.filter((o) => o.deadline && o.deadline <= q.deadlineBefore!);
  if (q.saved === '1') items = items.filter((o) => o.saved);
  if (q.q) { const needle = q.q.toLowerCase(); items = items.filter((o) => `${o.title} ${o.company} ${o.field} ${o.skills.join(' ')} ${o.description}`.toLowerCase().includes(needle)); }
  const sort = q.sort ?? 'match';
  items.sort((a, b) => sort === 'match' ? b.match.score - a.match.score || (a.deadline ?? '9').localeCompare(b.deadline ?? '9') : sort === 'deadline' ? (a.deadline ?? '9').localeCompare(b.deadline ?? '9') : (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
  const all = db().all<OpportunityRow>('SELECT type, city, field, skills, remote FROM opportunities');
  const facets = {
    types: [...new Set(all.map((o) => o.type))].sort(), cities: [...new Set(all.map((o) => o.city))].sort(), fields: [...new Set(all.map((o) => o.field))].sort(),
    skills: [...new Set(all.flatMap((o) => pj<string[]>(o.skills, [])))].sort(), remote: [...new Set(all.map((o) => o.remote))].sort()
  };
  ok(res, { items, facets, today, total: items.length });
}));

opportunitiesRouter.get('/opportunities/:id', h((req, res) => {
  const u = requireUser(req);
  const row = db().get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', req.params.id as string);
  if (!row) throw notFound('Opportunity not found');
  ok(res, decorate([row], u.id)[0]);
}));

opportunitiesRouter.post('/opportunities/:id/save', h((req, res) => {
  const u = requireUser(req);
  const id = req.params.id as string;
  if (!db().get('SELECT id FROM opportunities WHERE id = ?', id)) throw notFound('Opportunity not found');
  const existed = !!db().get('SELECT 1 FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?', u.id, id);
  if (!existed) db().run('INSERT INTO saved_opportunities (user_id, opportunity_id, created_at) VALUES (?, ?, ?)', u.id, id, nowIso());
  ok(res, { saved: true, already: existed });
}));

opportunitiesRouter.delete('/opportunities/:id/save', h((req, res) => {
  const u = requireUser(req);
  db().run('DELETE FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?', u.id, req.params.id as string);
  ok(res, { saved: false });
}));

/** OpportunitySourceAdapter demo provider: adds labelled records; dedupes by (source, source_id) and normalized URL. */
opportunitiesRouter.post('/feed/refresh', h((req, res) => {
  const u = requireUser(req);
  const today = todayIso();
  const fetched = demoOpportunitySource.fetchNew({ today });
  const added: string[] = [];
  let skipped = 0;
  db().tx(() => {
    for (const f of fetched) {
      const normalized = normalizeUrl(f.url);
      const dup = db().get('SELECT id FROM opportunities WHERE (source = ? AND source_id = ?) OR (normalized_url IS NOT NULL AND normalized_url = ?)', f.source, f.source_id, normalized);
      if (dup) { skipped++; db().run('UPDATE opportunities SET last_checked_at = ? WHERE id = ?', nowIso(), dup.id); continue; }
      const id = newId('opp');
      db().insert('opportunities', { id, source: f.source, source_id: f.source_id, url: f.url, normalized_url: normalized, title: f.title, company: f.company, type: f.type, location: f.location, city: f.city, remote: f.remote, field: f.field, skills: j(f.skills), eligibility: f.eligibility, deadline: f.deadline, posted_at: f.posted_at, last_checked_at: nowIso(), status: f.status, description: f.description, salary: f.salary ?? null, demo_label: 1, created_at: nowIso() });
      added.push(id);
    }
  });
  const items = added.length ? decorate(db().all<OpportunityRow>(`SELECT * FROM opportunities WHERE id IN (${added.map(() => '?').join(',')})`, ...added), u.id) : [];
  const matching = items.filter((o) => o.match.score >= 40);
  if (matching.length) {
    notify(u.id, { module: 'career', kind: 'new_opportunities', title: `${matching.length} new ${matching.length === 1 ? 'opportunity matches' : 'opportunities match'} your interests`, body: matching.map((o) => `${o.title} · ${o.company}`).join(' · '), link: '/career?tab=discover' });
  }
  audit(u.id, 'career.feed.refresh', 'opportunity', 'demo-feed', { added: added.length, skipped });
  ok(res, { added: added.length, skipped, simulated: true, provider: demoOpportunitySource.name, items, notified: matching.length });
}));

/** Manual entry: paste a link. Dedupes by normalized URL / (source, source_id) and returns the existing record. */
opportunitiesRouter.post('/opportunities/import', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ url: z.string().min(4), title: z.string().max(200).optional(), company: z.string().max(200).optional(), type: z.enum(['internship', 'coop', 'entry', 'research', 'competition']).optional() }), req.body);
  const normalized = normalizeUrl(body.url);
  if (!normalized) throw bad('That does not look like a valid URL');
  const sourceId = urlHash(normalized);
  const existing = db().get<OpportunityRow>('SELECT * FROM opportunities WHERE normalized_url = ? OR (source = ? AND source_id = ?)', normalized, 'manual', sourceId);
  if (existing) {
    db().run('INSERT OR IGNORE INTO saved_opportunities (user_id, opportunity_id, created_at) VALUES (?, ?, ?)', u.id, existing.id, nowIso());
    ok(res, { duplicate: true, opportunity: decorate([existing], u.id)[0], message: 'This link is already in your list (matched by normalized URL).' });
    return;
  }
  const host = new URL(normalized).hostname;
  const id = newId('opp');
  const title = body.title?.trim() || `Imported posting (${host})`;
  const company = body.company?.trim() || host.split('.').slice(-2, -1)[0] || host;
  db().insert('opportunities', { id, source: 'manual', source_id: sourceId, url: body.url.trim(), normalized_url: normalized, title, company, type: body.type ?? 'internship', location: '', city: '', remote: 'onsite', field: '', skills: '[]', eligibility: '', deadline: null, posted_at: todayIso(), last_checked_at: nowIso(), status: 'unverified', description: 'Manually added link. Details are not verified by the demo feed – confirm on the source page.', salary: null, demo_label: 1, created_at: nowIso() });
  db().run('INSERT INTO saved_opportunities (user_id, opportunity_id, created_at) VALUES (?, ?, ?)', u.id, id, nowIso());
  audit(u.id, 'career.opportunity.import', 'opportunity', id, { normalized });
  ok(res, { duplicate: false, opportunity: decorate([db().get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', id)!], u.id)[0] }, 201);
}));

export type DecoratedOpportunity = Opportunity & { match: ReturnType<typeof matchOpportunity>; saved: boolean; applicationId: string | null; applicationStatus: string | null };
