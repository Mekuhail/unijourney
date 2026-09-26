import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { setClockOverride } from '../server/core/clock.ts';
import { studentContext, getSection } from '../server/modules/academics/common.ts';
import { analyzeEligibility, checkBasket } from '../server/modules/academics/planner.ts';

interface Proposal { id: string; status: string; revision: number; section_ids: string[]; credits: number; checks: Array<{ id: string; status: string; hard: boolean }>; options: Array<{ id: string; section_ids: string[]; credits: number; feasible: boolean }>; approval_id: string | null; operation_id: string | null; receipt: { portalRef: string } | null; hard_fails: string[] }

let srv: TestServer;
beforeAll(async () => { freshDb(); srv = await startServer(); });
afterAll(async () => { await srv.close(); });

const enrolled = (sectionId: string) => db().get<{ enrolled: number }>('SELECT enrolled FROM course_sections WHERE id = ?', sectionId)!.enrolled;

async function approvedProposal(prefs: Record<string, unknown> = {}) {
  const sara = srv.as('u_student');
  const c = await sara.post<{ proposal: Proposal }>('/academics/proposals', { term: '2026-2', preferences: prefs });
  expect(c.status).toBe(201);
  const p = c.body.data!.proposal;
  expect(p.status).toBe('needs_review');
  expect(p.options.length).toBeGreaterThanOrEqual(2);
  const a = await sara.post<{ proposal: Proposal; approval: { id: string } }>(`/academics/proposals/${p.id}/approve`);
  expect(a.status).toBe(200);
  return { sara, id: p.id, approvalId: a.body.data!.approval.id, proposal: a.body.data!.proposal };
}

describe('registration agent: deterministic checks', () => {
  it('detects unmet and in-progress prerequisites and 90 CH rules', () => {
    const ctx = studentContext('u_student');
    const elig = analyzeEligibility(ctx, '2026-2', {});
    const byCode = Object.fromEntries(elig.map((e) => [e.code, e]));
    expect(byCode['CIS 443'].eligible).toBe(true);
    expect(byCode['CIS 491'].eligible).toBe(false);
    expect(byCode['CIS 491'].reasons.join(' ')).toMatch(/SWE 302/);
    expect(byCode['CIS 492'].reasons.join(' ')).toMatch(/CIS 491/);
    // counting in-progress courses makes CIS 491 conditionally eligible
    const cond = Object.fromEntries(analyzeEligibility(ctx, '2026-2', { countInProgress: true }).map((e) => [e.code, e]));
    expect(cond['CIS 491'].eligible).toBe(true);
    expect(cond['CIS 491'].conditional).toBe(true);
    // Faisal (level 3) lacks the 90 CH for CIS 491
    const f = Object.fromEntries(analyzeEligibility(studentContext('u_student2'), '2026-2', {}).map((e) => [e.code, e]));
    expect(f['CIS 491'].reasons.join(' ')).toMatch(/earned credits|Prerequisite/);
  });

  it('flags time overlap, full sections and the credit limit as hard failures', () => {
    const ctx = studentContext('u_student');
    const elig = analyzeEligibility(ctx, '2026-2', {});
    const s = (id: string) => getSection(id)!;
    const overlap = checkBasket(ctx, [s('sec_2026-2_cis443_02'), s('sec_2026-2_swe401_01')], {}, elig, '2026-2', { currentTerm: '2026-1' });
    expect(overlap.checks.find((c) => c.id === 'overlap')!.status).toBe('fail');
    const full = checkBasket(ctx, [s('sec_2026-2_swe321_01')], {}, elig, '2026-2', { currentTerm: '2026-1' });
    expect(full.checks.find((c) => c.id === 'capacity')!.status).toBe('fail');
    const tight = checkBasket(ctx, [s('sec_2026-2_cis443_01')], {}, elig, '2026-2', { currentTerm: '2026-1' });
    expect(tight.checks.find((c) => c.id === 'capacity')!.status).toBe('warn');
    const heavy = checkBasket(ctx, ['sec_2026-2_cis443_01', 'sec_2026-2_swe321_02', 'sec_2026-2_swe401_02', 'sec_2026-2_swe415_01', 'sec_2026-2_mis432_01', 'sec_2026-2_nes424_01', 'sec_2026-2_cis381_02'].map(s), {}, elig, '2026-2', { currentTerm: '2026-1' });
    expect(heavy.credits).toBeGreaterThan(19);
    expect(heavy.checks.find((c) => c.id === 'credit_limit')!.status).toBe('fail');
    // far building: SWE 401 sec 02 (Tuwaiq building) followed by SWE 321 sec 02 (Library) -> travel warning
    const travel = checkBasket(ctx, [s('sec_2026-2_swe401_02'), s('sec_2026-2_swe321_02')], {}, elig, '2026-2', { currentTerm: '2026-1' });
    expect(travel.checks.find((c) => c.id === 'travel')!.status).toBe('warn');
    // registering into the current term is closed
    const closed = checkBasket(ctx, [s('sec_2026-1_swe401_01')], {}, elig, '2026-1', { currentTerm: '2026-1' });
    expect(closed.checks.find((c) => c.id === 'term')!.status).toBe('fail');
  });

  it('parses free-text preferences into rules and generates distinct feasible options', async () => {
    const sara = srv.as('u_student');
    const c = await sara.post<{ proposal: Proposal & { preferences: { understood: string[]; avoidDays: number[]; avoidEarly: boolean } } }>('/academics/proposals', { term: '2026-2', preferences: { text: 'avoid early classes, no Thursday, workshop Tuesday 4pm' } });
    expect(c.status).toBe(201);
    const p = c.body.data!.proposal;
    expect(p.preferences.avoidEarly).toBe(true);
    expect(p.preferences.avoidDays).toContain(4);
    expect(p.options.length).toBeGreaterThanOrEqual(2);
    const sets = p.options.map((o) => o.section_ids.slice().sort().join(','));
    expect(new Set(sets).size).toBe(sets.length);
    for (const o of p.options) { expect(o.feasible).toBe(true); expect(o.credits).toBeLessThanOrEqual(19); }
    // no option uses a Thursday or 08:00 section
    for (const sid of p.section_ids) { const s = getSection(sid)!; for (const m of s.meetings) { expect(m.day).not.toBe(4); expect(m.start >= '09:00').toBe(true); } }
    // ownership: another student cannot read it
    const other = await srv.as('u_lead').get(`/academics/proposals/${p.id}`);
    expect(other.status).toBe(403);
  });
});

describe('registration agent: approval binding and submission', () => {
  it('invalidates the approval when the basket is edited', async () => {
    const { sara, id, approvalId } = await approvedProposal();
    const before = await sara.get<{ proposal: Proposal }>(`/academics/proposals/${id}`);
    const sid = before.body.data!.proposal.section_ids[0];
    const sec = getSection(sid)!;
    const alt = db().get<{ id: string }>('SELECT id FROM course_sections WHERE course_code = ? AND term = ? AND id != ?', sec.course_code, '2026-2', sid)!;
    const edit = await sara.put<{ proposal: Proposal }>(`/academics/proposals/${id}`, { swap: { from: sid, to: alt.id } });
    expect(edit.status).toBe(200);
    expect(edit.body.data!.proposal.status).toBe('needs_review');
    expect(edit.body.data!.proposal.revision).toBe(2);
    const apr = db().get<{ status: string }>('SELECT status FROM approvals WHERE id = ?', approvalId)!;
    expect(apr.status).toBe('invalidated');
    // re-approve first, then submitting with the OLD approval id is rejected
    await sara.post(`/academics/proposals/${id}/approve`);
    const sub = await sara.post(`/academics/proposals/${id}/submit`, { approvalId });
    expect(sub.status).toBe(409);
  });

  it('rejects an expired approval', async () => {
    const { sara, id, approvalId } = await approvedProposal();
    setClockOverride('2026-09-27T10:00:00+03:00'); // 60 min later (TTL 30)
    const sub = await sara.post(`/academics/proposals/${id}/submit`, { approvalId });
    setClockOverride('2026-09-27T09:00:00+03:00');
    expect(sub.status).toBe(409);
    expect(sub.body.error!.message).toMatch(/expired/);
    const after = await sara.get<{ proposal: Proposal }>(`/academics/proposals/${id}`);
    expect(after.body.data!.proposal.status).toBe('needs_review');
  });

  it('submits once: a duplicate submit returns the same receipt and never double-enrols', async () => {
    const { sara, id, approvalId, proposal } = await approvedProposal();
    const counts = Object.fromEntries(proposal.section_ids.map((s) => [s, enrolled(s)]));
    const first = await sara.post<{ outcome: string; receipt: { portalRef: string; status: string }; nextSteps: { resources: string[] } }>(`/academics/proposals/${id}/submit`, { approvalId });
    expect(first.status).toBe(200);
    expect(first.body.data!.outcome).toBe('submitted');
    expect(first.body.data!.receipt.status).toBe('committed');
    const second = await sara.post<{ outcome: string; receipt: { portalRef: string } }>(`/academics/proposals/${id}/submit`, { approvalId });
    expect(second.status).toBe(200);
    expect(second.body.data!.outcome).toBe('replayed');
    expect(second.body.data!.receipt.portalRef).toBe(first.body.data!.receipt.portalRef);
    for (const s of proposal.section_ids) expect(enrolled(s)).toBe(counts[s] + 1);
    expect(db().count('portal_operations', `kind = 'enrollment' AND student_id = 'u_student'`)).toBe(1);
    expect(db().count('transcript_entries', `student_id = 'u_student' AND term = '2026-2' AND status = 'enrolled'`)).toBe(proposal.section_ids.length);
    expect(db().count('calendar_entries', `owner_id = 'u_student' AND source_type = 'section' AND source_id LIKE 'sec_2026-2%'`)).toBeGreaterThan(0);
    // nextSteps offer resources + study setup
    expect(first.body.data!.nextSteps.resources.length).toBe(proposal.section_ids.length);
    // clean up so later tests start from an un-enrolled state
    db().run(`DELETE FROM transcript_entries WHERE student_id = 'u_student' AND term = '2026-2'`);
    db().run(`DELETE FROM calendar_entries WHERE owner_id = 'u_student' AND source_id LIKE 'sec_2026-2%'`);
  });

  it('forces re-review when a seat disappears between approval and submission', async () => {
    const { sara, id, approvalId } = await approvedProposal();
    const sub = await sara.post<{ proposal: Proposal }>(`/academics/proposals/${id}/submit`, { approvalId, simulate: 'stale_capacity' });
    expect(sub.status).toBe(409);
    const after = await sara.get<{ proposal: Proposal }>(`/academics/proposals/${id}`);
    expect(after.body.data!.proposal.status).toBe('needs_review');
    expect(after.body.data!.proposal.hard_fails.join(' ')).toMatch(/full/);
    expect(db().get<{ status: string }>('SELECT status FROM approvals WHERE id = ?', approvalId)!.status).toBe('invalidated');
    // approving again is blocked until the full section is swapped out
    const blocked = await sara.post(`/academics/proposals/${id}/approve`);
    expect(blocked.status).toBe(422);
    // restore seats for the following tests
    db().run(`UPDATE course_sections SET enrolled = capacity - 5 WHERE term = '2026-2' AND enrolled >= capacity AND id != 'sec_2026-2_swe321_01'`);
  });

  it('reconciles a timed-out submission without submitting twice', async () => {
    const { sara, id, approvalId, proposal } = await approvedProposal();
    const counts = Object.fromEntries(proposal.section_ids.map((s) => [s, enrolled(s)]));
    const sub = await sara.post<{ outcome: string; proposal: Proposal }>(`/academics/proposals/${id}/submit`, { approvalId, simulate: 'timeout' });
    expect(sub.status).toBe(202);
    expect(sub.body.data!.outcome).toBe('outcome_unknown');
    expect(sub.body.data!.proposal.operation_id).toBeTruthy();
    // a replacement submission is blocked while the outcome is unknown
    const again = await sara.post(`/academics/proposals/${id}/submit`, { approvalId });
    expect(again.status).toBe(409);
    const fresh = await sara.post('/academics/proposals', { term: '2026-2', preferences: {} });
    const blocked = await sara.post(`/academics/proposals/${(fresh.body.data as { proposal: Proposal }).proposal.id}/submit`, { approvalId: 'x' });
    expect(blocked.status).toBe(409);
    // reconcile finalises exactly once
    const st = await sara.get<{ outcome: string; receipt: { portalRef: string } }>(`/academics/proposals/${id}/status`);
    expect(st.status).toBe(200);
    expect(st.body.data!.outcome).toBe('submitted');
    const st2 = await sara.get<{ outcome: string; receipt: { portalRef: string } }>(`/academics/proposals/${id}/status`);
    expect(st2.body.data!.outcome).toBe('not_applicable');
    for (const s of proposal.section_ids) expect(enrolled(s)).toBe(counts[s] + 1);
    expect(db().count('portal_operations', `id = '${sub.body.data!.proposal.operation_id}'`)).toBe(1);
    expect(db().count('transcript_entries', `student_id = 'u_student' AND term = '2026-2' AND status = 'enrolled'`)).toBe(proposal.section_ids.length);
  });
});
