import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';

interface Item { id: string; kind: string; title: string; visibility: string; location: string | null; outcomes: string[]; needs_review: boolean; sort: number | null }

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('portfolio entries', () => {
  it('stores location and outcomes, and refuses an end date before the start date', async () => {
    const bad = await s.as('u_student').post('/career/portfolio/items', { kind: 'project', title: 'Parking finder', start_date: '2026-05', end_date: '2026-03' });
    expect(bad.status).toBe(422);
    const r = await s.as('u_student').post<{ item: Item }>('/career/portfolio/items', { kind: 'project', title: 'Parking finder', org: 'Hackathon team', location: 'Riyadh', outcomes: ['Won first place', 'Used by 40 students'], start_date: '2026-03', end_date: '2026-05' });
    expect(r.status).toBe(201);
    expect(r.body.data!.item).toMatchObject({ location: 'Riyadh', outcomes: ['Won first place', 'Used by 40 students'], needs_review: false });
  });

  it('keeps LinkedIn imports private until the student reviews them', async () => {
    const imp = await s.as('u_student').post('/career/portfolio/import/linkedin', { items: [{ kind: 'experience', title: 'Intern', org: 'Acme', visibility: 'employers', source_ref: 'li:intern:acme' }] });
    expect(imp.status).toBe(200);
    const items = (await s.as('u_student').get<{ items: Item[] }>('/career/portfolio')).body.data!.items;
    const it = items.find((x) => x.title === 'Intern')!;
    expect(it.visibility).toBe('private');
    expect(it.needs_review).toBe(true);
    expect((await s.as('u_student').patch(`/career/portfolio/items/${it.id}`, { visibility: 'employers' })).status).toBe(409);
    const ok = await s.as('u_student').patch<{ item: Item }>(`/career/portfolio/items/${it.id}`, { reviewed: true, visibility: 'employers' });
    expect(ok.status).toBe(200);
    expect(ok.body.data!.item).toMatchObject({ visibility: 'employers', needs_review: false });
  });

  it('keeps the student’s own order within a section, and only for their own entries', async () => {
    await s.as('u_student').post('/career/portfolio/items', { kind: 'project', title: 'Study planner prototype' });
    const list = (await s.as('u_student').get<{ items: Item[] }>('/career/portfolio')).body.data!.items.filter((i) => i.kind === 'project');
    expect(list.length).toBeGreaterThan(1);
    const reversed = list.map((i) => i.id).reverse();
    expect((await s.as('u_student').post('/career/portfolio/items/reorder', { ids: reversed })).status).toBe(200);
    const after = (await s.as('u_student').get<{ items: Item[] }>('/career/portfolio')).body.data!.items.filter((i) => i.kind === 'project').map((i) => i.id);
    expect(after).toEqual(reversed);
    expect((await s.as('u_lead').post('/career/portfolio/items/reorder', { ids: reversed })).status).toBe(404);
    expect((await s.as('u_security').get('/career/portfolio')).status).toBe(403);
  });
});
