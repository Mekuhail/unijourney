import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';

interface Opp { id: string; title: string; type: string; city: string; skills: string[]; expired: boolean; status: string; saved: boolean; applicationId: string | null; normalized_url: string | null; match: { score: number; reasons: string[]; missing: string[]; eligible: boolean | null } }
interface ListRes { items: Opp[]; total: number; facets: { types: string[] } }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('career discovery', () => {
  it('filters by type/city and explains the match with reasons and missing skills', async () => {
    const r = await s.as('u_student').get<ListRes>('/career/opportunities?type=internship&city=Riyadh');
    expect(r.status).toBe(200);
    const items = r.body.data!.items;
    expect(items.length).toBeGreaterThan(0);
    for (const o of items) { expect(o.type).toBe('internship'); expect(o.city).toBe('Riyadh'); expect(o.expired).toBe(false); }
    const stc = items.find((o) => o.id === 'opp_stc_swe_intern')!;
    expect(stc).toBeTruthy();
    expect(stc.match.score).toBeGreaterThan(40);
    expect(stc.match.reasons.some((x) => x.startsWith('Skills you list'))).toBe(true);
    expect(stc.match.missing).toEqual(['REST APIs']);
    expect(stc.match.eligible).toBe(true); // "level 5 or above" and Sara is level 6
    expect(stc.applicationId).toBeTruthy();
    // sorted by match score descending
    for (let i = 1; i < items.length; i++) expect(items[i - 1].match.score).toBeGreaterThanOrEqual(items[i].match.score);
  });

  it('filters by skill and hides expired postings unless asked', async () => {
    const react = await s.as('u_student').get<ListRes>('/career/opportunities?skill=react');
    expect(react.body.data!.items.every((o) => o.skills.map((x) => x.toLowerCase()).includes('react'))).toBe(true);
    const def = await s.as('u_student').get<ListRes>('/career/opportunities');
    expect(def.body.data!.items.some((o) => o.id === 'opp_stc_expired')).toBe(false);
    const all = await s.as('u_student').get<ListRes>('/career/opportunities?includeExpired=1');
    const exp = all.body.data!.items.find((o) => o.id === 'opp_stc_expired')!;
    expect(exp.expired).toBe(true);
    expect(exp.status).toBe('expired');
    expect(all.body.data!.total).toBeGreaterThanOrEqual(14);
  });

  it('eligibility is null when the posting has conditions the profile cannot verify', async () => {
    const r = await s.as('u_student').get<Opp>('/career/opportunities/opp_falconsoc_intern');
    expect(r.body.data!.match.eligible).toBeNull();
  });

  it('save is idempotent and can be undone', async () => {
    const c = s.as('u_student');
    const a = await c.post<{ saved: boolean; already: boolean }>('/career/opportunities/opp_ailab_intern/save');
    expect(a.status).toBe(200); expect(a.body.data).toEqual({ saved: true, already: false });
    const b = await c.post<{ saved: boolean; already: boolean }>('/career/opportunities/opp_ailab_intern/save');
    expect(b.body.data).toEqual({ saved: true, already: true });
    expect(db().count('saved_opportunities', 'user_id = ? AND opportunity_id = ?', 'u_student', 'opp_ailab_intern')).toBe(1);
    const d = await c.del('/career/opportunities/opp_ailab_intern/save');
    expect(d.status).toBe(200);
    expect(db().count('saved_opportunities', 'user_id = ? AND opportunity_id = ?', 'u_student', 'opp_ailab_intern')).toBe(0);
    // another student's view is unaffected
    const other = await s.as('u_student2').get<Opp>('/career/opportunities/opp_aratech_coop');
    expect(other.body.data!.saved).toBe(false);
  });

  it('feed refresh adds labelled demo records once and never duplicates', async () => {
    const before = db().count('opportunities');
    const first = await s.as('u_student').post<{ added: number; skipped: number; simulated: boolean; notified: number }>('/career/feed/refresh');
    expect(first.status).toBe(200);
    expect(first.body.data!.simulated).toBe(true);
    expect(first.body.data!.added).toBe(2);
    expect(first.body.data!.notified).toBeGreaterThan(0);
    const second = await s.as('u_student').post<{ added: number; skipped: number }>('/career/feed/refresh');
    expect(second.body.data!.added).toBe(0);
    expect(second.body.data!.skipped).toBe(2);
    expect(db().count('opportunities')).toBe(before + 2);
    expect(db().count('opportunities', "demo_label = 0")).toBe(0);
    expect(db().count('notifications', "user_id = 'u_student' AND kind = 'new_opportunities'")).toBe(1);
  });

  it('manual import normalizes the URL and returns the existing record on a duplicate', async () => {
    const c = s.as('u_student');
    const a = await c.post<{ duplicate: boolean; opportunity: Opp }>('/career/opportunities/import', { url: 'https://WWW.Example-Demo.sa/jobs/987/?utm_source=x&ref=abc', title: 'Imported role', company: 'Imported Co' });
    expect(a.status).toBe(201);
    expect(a.body.data!.duplicate).toBe(false);
    expect(a.body.data!.opportunity.normalized_url).toBe('https://example-demo.sa/jobs/987');
    expect(a.body.data!.opportunity.status).toBe('unverified');
    expect(a.body.data!.opportunity.saved).toBe(true);
    const b = await c.post<{ duplicate: boolean; opportunity: Opp }>('/career/opportunities/import', { url: 'example-demo.sa/jobs/987?fbclid=1' });
    expect(b.status).toBe(200);
    expect(b.body.data!.duplicate).toBe(true);
    expect(b.body.data!.opportunity.id).toBe(a.body.data!.opportunity.id);
    const bad = await c.post('/career/opportunities/import', { url: 'not a url at all' });
    expect(bad.status).toBe(400);
  });
});
