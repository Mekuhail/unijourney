import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';

interface Section { id: string; course_code: string; section_no: string; meetings: Array<{ day: number; start: string; end: string }> }
interface Proposal { id: string; revision: number; status: string; approval_id: string | null; sections: Section[] }
interface Compare { proposal: { revision: number }; current: string | null; options: Array<{ section: Section; is_current: boolean; feasible: boolean; hard_fails: Array<{ id: string }>; conflicts: Array<{ course_code: string }>; seats: { left: number; checked_at: string }; timetable_change: { removed: unknown[]; added: unknown[] } }>; peers: Array<{ peer: { first_en: string }; section: { section_no: string } | null }> }
interface Peers { basket: { id: string; revision: number } | null; links: Array<{ id: string; peer: { first_en: string }; my_shares: string[]; theirs: Array<{ course_code: string; section: { id: string; section_no: string } | null }>; overlaps: Array<{ course_code: string; same: boolean }> }>; incoming: Array<{ id: string; course_code: string; status: string }>; outgoing: Array<{ id: string; status: string }> }

let s: TestServer;
let sara: Proposal, layan: Proposal;
beforeAll(async () => {
  freshDb(); s = await startServer();
  sara = (await s.as('u_student').post<{ proposal: Proposal }>('/academics/proposals', { term: '2026-2', preferences: {} })).body.data!.proposal;
  layan = (await s.as('u_lead').post<{ proposal: Proposal }>('/academics/proposals', { term: '2026-2', preferences: {} })).body.data!.proposal;
});
afterAll(async () => { await s.close(); });
const sectionOf = (p: Proposal, code: string) => p.sections.find((x) => x.course_code === code)!;

describe('comparing sections', () => {
  it('compares every section of a basket course without changing the saved basket', async () => {
    const r = await s.as('u_student').get<Compare>(`/academics/proposals/${sara.id}/compare?course=SWE%20401`);
    expect(r.status).toBe(200);
    const c = r.body.data!;
    expect(c.options.length).toBe(2);
    expect(c.options.filter((o) => o.is_current).length).toBe(1);
    expect(c.current).toBe(sectionOf(sara, 'SWE 401').id);
    const alt = c.options.find((o) => !o.is_current)!;
    expect(alt.seats.checked_at).toBeTruthy();
    expect(alt.timetable_change.added.length + alt.timetable_change.removed.length).toBeGreaterThan(0);
    const after = (await s.as('u_student').get<{ proposal: Proposal }>(`/academics/proposals/${sara.id}`)).body.data!.proposal;
    expect(after.revision).toBe(sara.revision);
  });

  it('is private to the basket owner and to students', async () => {
    expect((await s.as('u_lead').get(`/academics/proposals/${sara.id}/compare?course=SWE%20401`)).status).toBe(403);
    expect((await s.as('u_security').get('/academics/peers')).status).toBe(403);
  });

  it('keeps a switch within the same course and refuses a stale revision', async () => {
    const cis = (await s.as('u_student').get<Compare>(`/academics/proposals/${sara.id}/compare?course=CIS%20222`)).body.data!.options.find((o) => !o.is_current)!;
    const bad = await s.as('u_student').put(`/academics/proposals/${sara.id}`, { swap: { from: sectionOf(sara, 'SWE 401').id, to: cis.section.id } });
    expect(bad.status).toBe(400);
    const stale = await s.as('u_student').put(`/academics/proposals/${sara.id}`, { swap: { from: sectionOf(sara, 'CIS 222').id, to: cis.section.id }, expectedRevision: sara.revision + 5 });
    expect(stale.status).toBe(409);
  });
});

describe('coordinating with a classmate', () => {
  let code = '';
  let linkId = '';
  it('connects only through a code the other student chooses to use', async () => {
    const inv = await s.as('u_student').post<{ code: string }>('/academics/peers/invites', {});
    expect(inv.status).toBe(201);
    code = inv.body.data!.code;
    const preview = await s.as('u_lead').post<{ preview: boolean; peer: { first_en: string } }>('/academics/peers/redeem', { code });
    expect(preview.body.data).toMatchObject({ preview: true, peer: { first_en: 'Sara' } });
    expect(db().count('peer_links')).toBe(0); // previewing links nothing
    expect((await s.as('u_student').post('/academics/peers/redeem', { code, confirm: true })).status).toBe(400); // own code
    const link = await s.as('u_lead').post<{ id: string }>('/academics/peers/redeem', { code, confirm: true });
    expect(link.status).toBe(201);
    linkId = link.body.data!.id;
    expect((await s.as('u_student2').post('/academics/peers/redeem', { code, confirm: true })).status).toBe(410); // used
  });

  it('shares nothing by default, then only the courses each student picks', async () => {
    let layanView = (await s.as('u_lead').get<Peers>('/academics/peers')).body.data!;
    expect(layanView.links[0].theirs).toEqual([]);
    expect((await s.as('u_student').put(`/academics/peers/links/${linkId}/shares`, { courses: ['SWE 401'] })).status).toBe(200);
    expect((await s.as('u_student').put(`/academics/peers/links/${linkId}/shares`, { courses: ['SWE 999'] })).status).toBe(422);
    await s.as('u_student').put(`/academics/peers/links/${linkId}/shares`, { courses: ['SWE 401'] });
    await s.as('u_lead').put(`/academics/peers/links/${linkId}/shares`, { courses: ['SWE 401', 'CIS 222'] });
    layanView = (await s.as('u_lead').get<Peers>('/academics/peers')).body.data!;
    const saraShares = layanView.links[0].theirs;
    expect(saraShares.map((x) => x.course_code)).toEqual(['SWE 401']); // not CIS 222, nothing else from Sara's basket
    expect(saraShares[0].section!.section_no).toBe(sectionOf(sara, 'SWE 401').section_no);
    expect(layanView.links[0].overlaps).toEqual([{ course_code: 'SWE 401', mine: expect.anything(), theirs: expect.anything(), same: false }]);
    // Faisal is not in the link and sees nothing of it.
    expect((await s.as('u_student2').get<Peers>('/academics/peers')).body.data!.links).toEqual([]);
    const cmp = (await s.as('u_student').get<Compare>(`/academics/proposals/${sara.id}/compare?course=SWE%20401`)).body.data!;
    expect(cmp.peers[0]).toMatchObject({ peer: { first_en: 'Layan' }, section: { section_no: sectionOf(layan, 'SWE 401').section_no } });
  });

  it('suggests a section only for a course both chose to share', async () => {
    const layanSwe = sectionOf(layan, 'SWE 401');
    expect((await s.as('u_lead').post(`/academics/peers/links/${linkId}/proposals`, { course_code: 'CIS 222', section_id: sectionOf(layan, 'CIS 222').id })).status).toBe(403);
    const r = await s.as('u_lead').post<{ id: string }>(`/academics/peers/links/${linkId}/proposals`, { course_code: 'SWE 401', section_id: layanSwe.id, note: 'Same lab group?' });
    expect(r.status).toBe(201);
    // Someone outside the connection cannot even learn the suggestion exists.
    expect((await s.as('u_student2').post(`/academics/peers/proposals/${r.body.data!.id}/apply`, { proposalId: sara.id, expectedRevision: 1 })).status).toBe(404);
  });

  it('re-checks the revision, the seats and conflicts before changing only the accepting student’s basket', async () => {
    const incoming = (await s.as('u_student').get<Peers>('/academics/peers')).body.data!.incoming[0];
    const current = (await s.as('u_student').get<{ proposal: Proposal }>(`/academics/proposals/${sara.id}`)).body.data!.proposal;
    // stale revision
    expect((await s.as('u_student').post(`/academics/peers/proposals/${incoming.id}/apply`, { proposalId: sara.id, expectedRevision: current.revision - 1 || 99 })).status).toBe(409);
    // seat taken in the meantime
    const target = sectionOf(layan, 'SWE 401').id;
    const seat = db().get<{ enrolled: number; capacity: number }>('SELECT enrolled, capacity FROM course_sections WHERE id = ?', target)!;
    db().run('UPDATE course_sections SET enrolled = capacity WHERE id = ?', target);
    expect((await s.as('u_student').post(`/academics/peers/proposals/${incoming.id}/apply`, { proposalId: sara.id, expectedRevision: current.revision })).status).toBe(409);
    db().run('UPDATE course_sections SET enrolled = ? WHERE id = ?', seat.enrolled, target);
    // a time clash with another course in Sara's basket
    const meetings = db().get<{ meetings: string }>('SELECT meetings FROM course_sections WHERE id = ?', target)!.meetings;
    const clashWith = current.sections.find((x) => x.course_code !== 'SWE 401')!;
    db().run('UPDATE course_sections SET meetings = ? WHERE id = ?', JSON.stringify(clashWith.meetings.map((m) => ({ ...m, location_id: null }))), target);
    const clash = await s.as('u_student').post<unknown>(`/academics/peers/proposals/${incoming.id}/apply`, { proposalId: sara.id, expectedRevision: current.revision });
    expect(clash.status).toBe(422);
    db().run('UPDATE course_sections SET meetings = ? WHERE id = ?', meetings, target);

    // Approve first, so we can see the approval being invalidated by the change.
    await s.as('u_student').post(`/academics/proposals/${sara.id}/approve`, {});
    const approved = (await s.as('u_student').get<{ proposal: Proposal }>(`/academics/proposals/${sara.id}`)).body.data!.proposal;
    const ok = await s.as('u_student').post<{ proposal: Proposal; undo: { swap: { from: string; to: string } } }>(`/academics/peers/proposals/${incoming.id}/apply`, { proposalId: sara.id, expectedRevision: approved.revision });
    expect(ok.status).toBe(200);
    expect(sectionOf(ok.body.data!.proposal, 'SWE 401').id).toBe(target);
    expect(ok.body.data!.proposal.status).toBe('needs_review');
    expect(ok.body.data!.proposal.approval_id).toBeNull();
    // Layan's basket did not move.
    expect(sectionOf((await s.as('u_lead').get<{ proposal: Proposal }>(`/academics/proposals/${layan.id}`)).body.data!.proposal, 'SWE 401').id).toBe(target);
    expect((await s.as('u_lead').get<Peers>('/academics/peers')).body.data!.outgoing[0].status).toBe('accepted');
    // Undo is an ordinary same-course switch back.
    const undo = await s.as('u_student').put<{ proposal: Proposal }>(`/academics/proposals/${sara.id}`, { ...ok.body.data!.undo, expectedRevision: ok.body.data!.proposal.revision });
    expect(sectionOf(undo.body.data!.proposal, 'SWE 401').id).toBe(sectionOf(sara, 'SWE 401').id);
  });

  it('either student can end the connection; shares and open suggestions go with it', async () => {
    await s.as('u_student').post(`/academics/peers/links/${linkId}/proposals`, { course_code: 'SWE 401', section_id: sectionOf(sara, 'SWE 401').id });
    expect((await s.as('u_lead').del(`/academics/peers/links/${linkId}`)).status).toBe(200);
    const saraView = (await s.as('u_student').get<Peers>('/academics/peers')).body.data!;
    expect(saraView.links).toEqual([]);
    expect(saraView.outgoing.find((p) => p.status === 'open')).toBeUndefined();
    expect(db().count('peer_shares', 'link_id = ?', linkId)).toBe(0);
    expect((await s.as('u_student2').del(`/academics/peers/links/${linkId}`)).status).toBe(404);
  });
});
