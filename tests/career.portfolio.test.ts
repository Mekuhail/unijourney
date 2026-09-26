import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { parseGithubUsername, fetchGithubSummary } from '../server/adapters/github.ts';
import { parseLinkedinUrl } from '../server/modules/career/portfolio.ts';
import { readLinkedinExport, parseCsv, exportDate, addToLinkedinUrl } from '../client/src/modules/career/linkedinExport.ts';

interface Skill { key: string; label_en: string; strength: number; evidence: Array<{ kind: string; ref: string }> }
interface Portfolio { items: Array<{ id: string; kind: string; title: string; source: string; verification: string }>; skills: Skill[]; consents: Record<string, { granted: boolean }>; accounts: Array<{ provider: string; handle: string; verified: boolean; method: string }>; education: { credits: number; gpa: number | null } }
interface Opp { id: string; match: { score: number; eligible: boolean | null; eligibility: { key: string; params: Record<string, number> } } }
interface Comp { id: string; segment: string; entry: { status: string; portfolio_item_id: string | null } | null; fit: string[] }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('portfolio', () => {
  it('builds evidence-weighted skills from courses, verified awards and self-declared skills', async () => {
    const r = await s.as('u_student').get<Portfolio>('/career/portfolio');
    expect(r.status).toBe(200);
    const p = r.body.data!;
    expect(p.consents.matching.granted).toBe(true);
    const award = p.items.find((i) => i.source === 'university');
    expect(award?.verification).toBe('university');
    const react = p.skills.find((x) => x.key === 'react')!;
    expect(react.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(['self', 'course_in_progress', 'award_verified']));
    expect(react.strength).toBe(1);
    const sql = p.skills.find((x) => x.key === 'sql')!;
    expect(sql.evidence.some((e) => e.kind === 'course' && e.ref === 'CIS 221')).toBe(true);
    expect(p.education.credits).toBeGreaterThan(80);
    expect(p.education.gpa).toBeGreaterThan(3);
  });

  it('portfolio evidence counts for matching only while consent is granted', async () => {
    const c = s.as('u_student');
    const with_ = (await c.get<Portfolio>('/career/portfolio')).body.data!.skills.find((x) => x.key === 'react')!;
    await c.put('/career/portfolio/consents', { purpose: 'matching', granted: false });
    const without = (await c.get<Portfolio>('/career/portfolio')).body.data!.skills.find((x) => x.key === 'react')!;
    expect(without.evidence.some((e) => e.kind === 'award_verified')).toBe(false);
    expect(without.strength).toBeLessThan(with_.strength);
    await c.put('/career/portfolio/consents', { purpose: 'matching', granted: true });
    expect(db().get<{ withdrawn_at: string | null }>(`SELECT withdrawn_at FROM portfolio_consents WHERE student_id = 'u_student' AND purpose = 'matching'`)!.withdrawn_at).toBeNull();
  });

  it('imports reviewed LinkedIn export items once, and erases them on request without touching verified awards', async () => {
    const c = s.as('u_student');
    const items = [
      { kind: 'experience', title: 'Student assistant', org: 'YU IT Help Desk', start_date: '2026-02', end_date: '2026-06', description: '', skills: ['Technical Writing'], source_ref: 'experience|student assistant|yu it help desk|2026-02' },
      { kind: 'project', title: 'Study room finder', org: '', start_date: '2026-03', end_date: null, description: 'React app', url: 'https://example.org/p', skills: ['React', 'Node.js'], source_ref: 'project|study room finder|2026-03' }
    ];
    const a = await c.post<{ added: number; skipped: number }>('/career/portfolio/import/linkedin', { items, headline: 'SWE student' });
    expect(a.body.data).toEqual({ added: 2, skipped: 0 });
    const b = await c.post<{ added: number; skipped: number }>('/career/portfolio/import/linkedin', { items });
    expect(b.body.data).toEqual({ added: 0, skipped: 2 });
    const e = await c.del('/career/portfolio/data?scope=linkedin_export');
    expect(e.status).toBe(200);
    const p = (await c.get<Portfolio>('/career/portfolio')).body.data!;
    expect(p.items.filter((i) => i.source === 'linkedin_export')).toHaveLength(0);
    expect(p.items.some((i) => i.verification === 'university')).toBe(true);
  });

  it('stores only a valid public LinkedIn URL and marks the sign-in check as simulated', async () => {
    const c = s.as('u_student');
    expect((await c.put('/career/portfolio/accounts/linkedin', { url: 'https://example.com/me' })).status).toBe(400);
    const ok = await c.put<{ accounts: Portfolio['accounts'] }>('/career/portfolio/accounts/linkedin', { url: 'linkedin.com/in/sara-otaibi-yu' });
    expect(ok.body.data!.accounts.find((x) => x.provider === 'linkedin')!.handle).toBe('sara-otaibi-yu');
    const v = await c.post<{ accounts: Portfolio['accounts']; simulated: boolean }>('/career/portfolio/accounts/linkedin/verify');
    expect(v.body.data!.simulated).toBe(true);
    expect(v.body.data!.accounts.find((x) => x.provider === 'linkedin')!.method).toBe('oidc_simulated');
    expect(parseLinkedinUrl('https://sa.linkedin.com/in/abc-123/')?.url).toBe('https://www.linkedin.com/in/abc-123');
  });

  it('exports a JSON Resume document', async () => {
    const r = await s.as('u_student').get<{ basics: { name: string }; awards: Array<{ title: string }>; skills: Array<{ name: string }>; meta: { version: string } }>('/career/portfolio/resume.json');
    expect(r.body.data!.basics.name).toBe('Sara Al-Otaibi');
    expect(r.body.data!.awards.some((a) => a.title.includes('Spring Hackathon'))).toBe(true);
    expect(r.body.data!.skills.length).toBeGreaterThan(5);
    expect(r.body.data!.meta.version).toBe('v1.0.0');
  });

  it('checks co-op eligibility against completed credit hours from the transcript', async () => {
    const sara = (await s.as('u_student').get<Opp>('/career/opportunities/opp_aratech_coop')).body.data!;
    expect(['elig.coopMet', 'elig.coopMetExtra']).toContain(sara.match.eligibility.key);
    const faisal = (await s.as('u_student2').get<Opp>('/career/opportunities/opp_aratech_coop')).body.data!;
    expect(faisal.match.eligibility.key).toBe('elig.coopShort');
    expect(faisal.match.eligible).toBe(false);
    expect(faisal.match.eligibility.params.left).toBeGreaterThan(0);
  });

  it('keeps other students out of a portfolio', async () => {
    const mine = (await s.as('u_student').get<Portfolio>('/career/portfolio')).body.data!.items[0];
    const r = await s.as('u_student2').del(`/career/portfolio/items/${mine.id}`);
    expect(r.status).toBe(404);
  });
});

describe('competitions', () => {
  it('lists competitions by segment with counts and skill fit', async () => {
    const r = await s.as('u_student').get<{ items: Comp[]; counts: Record<string, number> }>('/career/competitions?segment=open');
    expect(r.body.data!.items.every((c) => c.segment === 'open')).toBe(true);
    expect(r.body.data!.counts.past).toBeGreaterThanOrEqual(1);
    expect(r.body.data!.counts.upcoming).toBeGreaterThanOrEqual(1);
    const farq = r.body.data!.items.find((c) => c.id === 'comp_farq_2026')!;
    expect(farq.entry?.status).toBe('interested');
  });

  it('interest puts the registration deadline on the calendar; registering swaps it for the event', async () => {
    const c = s.as('u_student');
    await c.put('/career/competitions/comp_ux_sprint/entry', { status: 'interested' });
    expect(db().count('calendar_entries', `owner_id = 'u_student' AND source_id = 'comp-reg:comp_ux_sprint'`)).toBe(1);
    await c.put('/career/competitions/comp_ux_sprint/entry', { status: 'registered' });
    expect(db().count('calendar_entries', `owner_id = 'u_student' AND source_id = 'comp-reg:comp_ux_sprint'`)).toBe(0);
    expect(db().count('calendar_entries', `owner_id = 'u_student' AND source_id = 'comp:comp_ux_sprint'`)).toBe(1);
    const w = await c.del('/career/competitions/comp_ux_sprint/entry');
    expect(w.status).toBe(200);
    expect(db().count('calendar_entries', `owner_id = 'u_student' AND source_id LIKE '%comp_ux_sprint'`)).toBe(0);
  });

  it('refuses registration before it opens', async () => {
    const r = await s.as('u_student').put('/career/competitions/comp_winter/entry', { status: 'registered' });
    expect(r.status).toBe(422);
  });

  it('a result on a YU competition becomes a verified portfolio award', async () => {
    const c = s.as('u_student2');
    const r = await c.put<{ portfolio_item_id: string }>('/career/competitions/comp_spring_2026/entry', { status: 'result', result: 'Finalist', team_name: 'Khobar Coders' });
    expect(r.status).toBe(200);
    const item = db().get<{ verification: string; student_id: string; title: string }>('SELECT verification, student_id, title FROM portfolio_items WHERE id = ?', r.body.data!.portfolio_item_id)!;
    expect(item).toMatchObject({ verification: 'university', student_id: 'u_student2' });
    expect(item.title).toContain('Finalist');
  });
});

describe('import helpers', () => {
  it('reads only whitelisted files from a LinkedIn export and maps them to draft items', async () => {
    const buf = readFileSync(new URL('../client/public/samples/linkedin-export-sample.zip', import.meta.url));
    const out = await readLinkedinExport(new File([buf], 'export.zip'));
    expect(out.filesRead.sort()).toEqual(['certifications.csv', 'education.csv', 'honors.csv', 'languages.csv', 'positions.csv', 'profile.csv', 'projects.csv', 'skills.csv']);
    expect(out.filesIgnored).toBe(2); // Connections.csv and messages.csv are never opened
    expect(out.headline).toContain('Software Engineering');
    expect(out.items.filter((i) => i.kind === 'experience')).toHaveLength(2);
    expect(out.items.find((i) => i.kind === 'project')!.start_date).toBe('2026-03');
    expect(out.skills).toContain('React');
  });

  it('parses quoted CSV fields and LinkedIn dates', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(exportDate('Mar 2024')).toBe('2024-03');
    expect(exportDate('2023')).toBe('2023');
    expect(exportDate('soon')).toBeNull();
    expect(addToLinkedinUrl({ name: 'Finalist', org: 'Al Yamamah University', date: '2026-03' })).toContain('issueMonth=3');
  });

  it('validates GitHub usernames and summarises public repositories without auth', async () => {
    expect(parseGithubUsername('https://github.com/octo-cat')).toBe('octo-cat');
    expect(parseGithubUsername('bad name')).toBeNull();
    const fake = (async (url: string) => {
      const u = String(url);
      const body = u.endsWith('/users/octo-cat')
        ? { login: 'octo-cat', name: 'Octo', html_url: 'https://github.com/octo-cat', avatar_url: '', public_repos: 3 }
        : [{ name: 'a', description: null, html_url: 'x', language: 'TypeScript', stargazers_count: 2, topics: [], pushed_at: '2026-09-01', fork: false }, { name: 'b', description: null, html_url: 'y', language: 'TypeScript', stargazers_count: 0, pushed_at: '2026-08-01', fork: false }, { name: 'c', description: null, html_url: 'z', language: 'Go', stargazers_count: 0, pushed_at: '2026-07-01', fork: true }];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const g = await fetchGithubSummary('octo-cat', fake);
    expect(g.repos).toHaveLength(2); // forks excluded
    expect(g.languages).toEqual([{ name: 'TypeScript', repos: 2 }]);
  });
});
