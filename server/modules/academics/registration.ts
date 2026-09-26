import { db, j, pj } from '../../core/db.ts';
import { localToIso, nowIso } from '../../core/clock.ts';
import { newId, stableHash } from '../../core/ids.ts';
import { bad, conflict, forbidden, notFound, unprocessable } from '../../core/http.ts';
import { checkApproval, consumeApproval, createApproval, getApproval, invalidateApprovals } from '../../core/approvals.ts';
import { upsertEntry } from '../../core/calendar.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { getPolicies, CURRENT_TERM } from '../../core/settings.ts';
import type { User } from '../../../shared/types.ts';
import { getSection, locationInfo, meetingOccurrences, studentContext, termLabel, TERM_DATES, type SectionView } from './common.ts';
import { prereqRule } from './curriculum.ts';
import { analyzeEligibility, checkBasket, generateOptions, hardFails, type Check, type EligibleCourse, type PlanOption, type Preferences } from './planner.ts';
import { parsePreferenceText } from './nl.ts';
import { aiAvailable, aiJson } from '../../adapters/ai.ts';
import { getSubmissionStatus, newOperationId, previewEnrollment, submitEnrollment, type EnrollmentReceipt, type SimulateMode } from './portal.ts';

export interface ActionLogEntry { at: string; step: string; detail: string }
export interface ProposalView {
  id: string; student_id: string; term: string; term_label: { en: string; ar: string }; status: string; revision: number; section_ids: string[]; credits: number; checks: Check[]; rationale: string;
  preferences: Preferences & { understood?: string[]; unparsed?: string[]; ai?: string }; options: PlanOption[]; action_log: ActionLogEntry[]; approval_id: string | null; approval: { id: string; status: string; expires_at: string; revision: number } | null;
  operation_id: string | null; receipt: (EnrollmentReceipt & { nextSteps?: unknown }) | null; error: string | null; created_at: string; updated_at: string; sections: SectionView[]; hard_fails: string[]; can_approve: boolean; payload_hash: string;
}

const REGISTRABLE_TERMS = () => [String(process.env.NEXT_TERM_OVERRIDE ?? '2026-2')];

export function payloadHash(term: string, sectionIds: string[]): string {
  return stableHash({ term, section_ids: [...sectionIds].sort() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proposalView(r: any): ProposalView {
  const sectionIds = pj<string[]>(r.section_ids, []);
  const checks = pj<Check[]>(r.checks, []);
  const approval = r.approval_id ? getApproval(r.approval_id) : null;
  const sections = sectionIds.map((id) => getSection(id)).filter((s): s is SectionView => !!s);
  const fails = hardFails(checks).map((c) => `${c.label}: ${c.explanation}`);
  return {
    id: r.id, student_id: r.student_id, term: r.term, term_label: termLabel(r.term), status: r.status, revision: r.revision, section_ids: sectionIds, credits: r.credits, checks, rationale: r.rationale,
    preferences: pj(r.preferences, {}), options: pj<PlanOption[]>(r.options, []), action_log: pj<ActionLogEntry[]>(r.action_log, []), approval_id: r.approval_id ?? null,
    approval: approval ? { id: approval.id, status: approval.status, expires_at: approval.expires_at, revision: approval.revision } : null,
    operation_id: r.operation_id ?? null, receipt: pj(r.receipt, null), error: r.error ?? null, created_at: r.created_at, updated_at: r.updated_at, sections, hard_fails: fails,
    can_approve: ['needs_review', 'approved', 'draft'].includes(r.status) && fails.length === 0 && sectionIds.length > 0, payload_hash: r.payload_hash
  };
}

export function getProposalRow(id: string) {
  const r = db().get('SELECT * FROM enrollment_proposals WHERE id = ?', id);
  if (!r) throw notFound('Proposal not found');
  return r;
}
export function requireOwnProposal(user: User, id: string) {
  const r = getProposalRow(id);
  if (r.student_id !== user.id) throw forbidden();
  return r;
}
export function listProposals(userId: string): ProposalView[] {
  return db().all('SELECT * FROM enrollment_proposals WHERE student_id = ? ORDER BY created_at DESC', userId).map(proposalView);
}

function log(entries: ActionLogEntry[], step: string, detail: string): ActionLogEntry[] {
  entries.push({ at: nowIso(), step, detail });
  return entries;
}

/** Merge explicit preferences with rules parsed from free text; optionally let the model add *interpretation only*. */
export async function resolvePreferences(input: Preferences, knownCourses: Set<string>): Promise<ProposalView['preferences']> {
  const parsed = input.text ? parsePreferenceText(input.text, knownCourses) : { understood: [], unparsed: [] };
  const merged: ProposalView['preferences'] = {
    ...input,
    avoidEarly: input.avoidEarly || parsed.avoidEarly || undefined,
    avoidDays: [...new Set([...(input.avoidDays ?? []), ...(parsed.avoidDays ?? [])])],
    keepWindows: [...(input.keepWindows ?? []), ...(parsed.keepWindows ?? [])],
    maxCredits: input.maxCredits ?? parsed.maxCredits,
    courses: [...new Set([...(input.courses ?? []), ...(parsed.courses ?? [])])],
    compact: input.compact || parsed.compact || undefined,
    lightLoad: input.lightLoad || parsed.lightLoad || undefined,
    countInProgress: input.countInProgress || parsed.countInProgress || undefined,
    understood: parsed.understood,
    unparsed: parsed.unparsed
  };
  if (input.text && parsed.unparsed.length && aiAvailable()) {
    // The model may only propose the same structured fields; every value is re-validated and rules stay deterministic.
    const ai = await aiJson<{ avoidEarly?: boolean; avoidDays?: number[]; maxCredits?: number; summary?: string }>('You map a student\'s registration preference text to JSON fields {avoidEarly?:boolean, avoidDays?:number[] (0=Sunday..6), maxCredits?:number, summary?:string}. Only include fields clearly stated.', parsed.unparsed.join('. '), 6000);
    if (ai.data) {
      if (typeof ai.data.avoidEarly === 'boolean' && merged.avoidEarly === undefined) merged.avoidEarly = ai.data.avoidEarly;
      if (Array.isArray(ai.data.avoidDays)) merged.avoidDays = [...new Set([...(merged.avoidDays ?? []), ...ai.data.avoidDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)])];
      if (typeof ai.data.maxCredits === 'number' && merged.maxCredits === undefined && ai.data.maxCredits >= 1 && ai.data.maxCredits <= 24) merged.maxCredits = ai.data.maxCredits;
      merged.ai = ai.data.summary ? `Model interpretation (${ai.provider}): ${ai.data.summary}` : `Model consulted (${ai.provider})`;
    }
  }
  return merged;
}

export async function createProposal(user: User, term: string, input: Preferences): Promise<{ proposal: ProposalView; eligibility: EligibleCourse[] }> {
  if (!REGISTRABLE_TERMS().includes(term)) throw unprocessable(`Registration is only open for ${REGISTRABLE_TERMS().join(', ')}.`);
  const ctx = studentContext(user.id);
  if (!ctx.programId) throw unprocessable('No program on record for this account.');
  const known = new Set(analyzeEligibility(ctx, term, {}).map((e) => e.code));
  const prefs = await resolvePreferences(input, known);
  const actionLog: ActionLogEntry[] = [];
  log(actionLog, 'read_records', `Read transcript: ${ctx.completed.size} completed, ${ctx.enrolled.size} in progress, ${ctx.earnedCredits} earned credits; program ${ctx.programId}; campus ${ctx.campusId}.`);
  log(actionLog, 'parse_preferences', prefs.understood?.length ? `Understood: ${prefs.understood.join('; ')}${prefs.unparsed?.length ? `. Not understood: ${prefs.unparsed.join('; ')}` : ''}` : 'No free-text preferences; using the form values.');
  const gen = generateOptions(ctx, term, prefs, { currentTerm: CURRENT_TERM });
  const eligible = gen.eligible.filter((e) => e.eligible);
  log(actionLog, 'eligibility', `${eligible.length} eligible courses (${eligible.map((e) => e.code).join(', ') || 'none'}); ${gen.eligible.length - eligible.length} blocked.`);
  log(actionLog, 'search', `Explored ${gen.explored} section combinations with hard checks (prerequisites, co-requisites, duplicates, time overlap, seats, credit limit ${Math.min(getPolicies().creditLimit.value, prefs.maxCredits ?? 99)}, travel gaps).`);
  for (const n of gen.notes) log(actionLog, 'note', n);
  const chosen = gen.options[0];
  log(actionLog, 'options', gen.options.length ? `Generated ${gen.options.length} distinct option${gen.options.length > 1 ? 's' : ''}: ${gen.options.map((o) => `${o.id} (${o.credits} cr, ${o.courses.map((c) => c.code).join('/')})`).join('; ')}.` : 'No feasible combination found.');
  const checks = chosen?.checks ?? [];
  const rationale = chosen
    ? `Option ${chosen.id} maximises progress on required courses (${chosen.courses.filter((c) => gen.eligible.find((e) => e.code === c.code)?.required).map((c) => c.code).join(', ') || 'electives only'}) within ${chosen.credits} credits while respecting ${prefs.understood?.length ? prefs.understood.join(', ').toLowerCase() : 'the default policy limits'}.${gen.notes.length ? ' Notes: ' + gen.notes.join(' ') : ''}`
    : `No feasible combination: ${gen.notes.join(' ') || 'no eligible course has an open section.'} Try relaxing a preference or counting in-progress courses.`;
  const id = newId('prp');
  const now = nowIso();
  const sectionIds = chosen?.section_ids ?? [];
  db().insert('enrollment_proposals', { id, student_id: user.id, term, section_ids: j(sectionIds), credits: chosen?.credits ?? 0, status: 'needs_review', revision: 1, payload_hash: payloadHash(term, sectionIds), checks: j(checks), rationale, preferences: j(prefs), options: j(gen.options), action_log: j(actionLog), approval_id: null, operation_id: null, receipt: null, error: null, created_at: now, updated_at: now });
  audit(user.id, 'academics.proposal.create', 'enrollment_proposal', id, { term, options: gen.options.length });
  return { proposal: proposalView(getProposalRow(id)), eligibility: gen.eligible };
}

export interface ProposalPatch { optionId?: string; add?: string; remove?: string; swap?: { from: string; to: string }; pinned?: string[]; sectionIds?: string[]; preferences?: Preferences }

export async function updateProposal(user: User, id: string, patch: ProposalPatch): Promise<{ proposal: ProposalView; eligibility: EligibleCourse[] }> {
  const r = requireOwnProposal(user, id);
  if (!['draft', 'needs_review', 'approved'].includes(r.status as string)) throw conflict(`Proposal is ${r.status} and can no longer be edited.`);
  const ctx = studentContext(user.id);
  const prefs = pj<ProposalView['preferences']>(r.preferences, {});
  const actionLog = pj<ActionLogEntry[]>(r.action_log, []);
  const options = pj<PlanOption[]>(r.options, []);
  let sectionIds = pj<string[]>(r.section_ids, []);
  let nextPrefs = prefs;
  let nextOptions = options;
  let regenerated = false;
  if (patch.preferences) {
    const known = new Set(analyzeEligibility(ctx, r.term as string, {}).map((e) => e.code));
    nextPrefs = await resolvePreferences({ ...prefs, ...patch.preferences }, known);
    const gen = generateOptions(ctx, r.term as string, nextPrefs, { currentTerm: CURRENT_TERM });
    nextOptions = gen.options;
    sectionIds = gen.options[0]?.section_ids ?? [];
    regenerated = true;
    log(actionLog, 'regenerate', `Preferences changed; regenerated ${gen.options.length} options (${gen.explored} combinations explored).`);
  }
  if (patch.optionId) { const o = nextOptions.find((x) => x.id === patch.optionId); if (!o) throw bad('Unknown option'); sectionIds = [...o.section_ids]; log(actionLog, 'choose_option', `Student chose option ${o.id} (${o.label_en}).`); }
  if (patch.sectionIds) { sectionIds = [...new Set(patch.sectionIds)]; log(actionLog, 'set_sections', `Student set the basket to ${sectionIds.length} sections.`); }
  if (patch.swap) { const s = getSection(patch.swap.to); if (!s) throw notFound('Section not found'); sectionIds = sectionIds.filter((x) => x !== patch.swap!.from); if (!sectionIds.includes(s.id)) sectionIds.push(s.id); log(actionLog, 'swap', `Swapped ${patch.swap.from} for ${s.course_code} sec ${s.section_no}.`); }
  if (patch.add) { const s = getSection(patch.add); if (!s) throw notFound('Section not found'); if (s.term !== r.term) throw bad('Section belongs to a different term'); if (!sectionIds.includes(s.id)) sectionIds.push(s.id); log(actionLog, 'add', `Added ${s.course_code} sec ${s.section_no}.`); }
  if (patch.remove) { sectionIds = sectionIds.filter((x) => x !== patch.remove); log(actionLog, 'remove', `Removed ${patch.remove}.`); }
  if (patch.pinned) { nextPrefs = { ...nextPrefs, pinned: patch.pinned }; log(actionLog, 'pin', patch.pinned.length ? `Pinned ${patch.pinned.length} section(s).` : 'Cleared pins.'); }
  const sections = sectionIds.map((sid) => getSection(sid)).filter((s): s is SectionView => !!s);
  const elig = analyzeEligibility(ctx, r.term as string, nextPrefs);
  const { checks, credits } = checkBasket(ctx, sections, nextPrefs, elig, r.term as string, { currentTerm: CURRENT_TERM });
  const fails = hardFails(checks);
  log(actionLog, 'recheck', fails.length ? `Re-ran checks: ${fails.length} hard failure(s): ${fails.map((f) => f.label).join(', ')}.` : 'Re-ran checks: all hard checks pass.');
  const revision = (r.revision as number) + 1;
  const hash = payloadHash(r.term as string, sectionIds);
  const materialChange = hash !== r.payload_hash || regenerated;
  if (materialChange || r.status === 'approved') { invalidateApprovals('enrollment', id); log(actionLog, 'approval_invalidated', 'Previous approval invalidated because the basket changed; a fresh review is required.'); }
  db().update('enrollment_proposals', id, { section_ids: j(sectionIds), credits, status: 'needs_review', revision, payload_hash: hash, checks: j(checks), preferences: j(nextPrefs), options: j(nextOptions), action_log: j(actionLog), approval_id: null, updated_at: nowIso(), rationale: regenerated ? (nextOptions[0] ? `Regenerated after a preference change. ${r.rationale}` : 'No feasible combination after the preference change.') : r.rationale });
  audit(user.id, 'academics.proposal.update', 'enrollment_proposal', id, { revision, patch: Object.keys(patch) });
  return { proposal: proposalView(getProposalRow(id)), eligibility: elig };
}

/** Explicit final review: recomputes checks live, then binds an approval to {term, section_ids} at this revision. */
export function approveProposal(user: User, id: string): { proposal: ProposalView; approval: { id: string; expires_at: string }; summary: { term: string; sections: Array<{ section_id: string; course_code: string; title_en: string; section_no: string; credits: number }>; total_credits: number } } {
  const r = requireOwnProposal(user, id);
  if (!['draft', 'needs_review', 'approved'].includes(r.status as string)) throw conflict(`Proposal is ${r.status}; only proposals awaiting review can be approved.`);
  const ctx = studentContext(user.id);
  const sectionIds = pj<string[]>(r.section_ids, []);
  if (!sectionIds.length) throw unprocessable('The basket is empty.');
  const sections = sectionIds.map((sid) => getSection(sid)).filter((s): s is SectionView => !!s);
  const prefs = pj<Preferences>(r.preferences, {});
  const { checks, credits } = checkBasket(ctx, sections, prefs, analyzeEligibility(ctx, r.term as string, prefs), r.term as string, { currentTerm: CURRENT_TERM });
  const fails = hardFails(checks);
  const actionLog = pj<ActionLogEntry[]>(r.action_log, []);
  if (fails.length) {
    log(actionLog, 'approve_blocked', `Approval blocked: ${fails.map((f) => `${f.label} — ${f.explanation}`).join('; ')}`);
    db().update('enrollment_proposals', id, { checks: j(checks), credits, action_log: j(actionLog), updated_at: nowIso() });
    throw unprocessable('Approval blocked: not all hard checks pass.', { fails: fails.map((f) => ({ id: f.id, label: f.label, explanation: f.explanation })) });
  }
  const hash = payloadHash(r.term as string, sectionIds);
  const approval = createApproval(user.id, 'enrollment', id, r.revision as number, hash);
  log(actionLog, 'approved', `Student approved revision ${r.revision}: ${sections.map((s) => `${s.course_code} sec ${s.section_no}`).join(', ')} (${credits} credits). Approval ${approval.id} expires ${approval.expires_at}.`);
  db().update('enrollment_proposals', id, { status: 'approved', approval_id: approval.id, payload_hash: hash, checks: j(checks), credits, action_log: j(actionLog), updated_at: nowIso() });
  audit(user.id, 'academics.proposal.approve', 'enrollment_proposal', id, { revision: r.revision, hash, approval: approval.id });
  return { proposal: proposalView(getProposalRow(id)), approval: { id: approval.id, expires_at: approval.expires_at }, summary: { term: r.term as string, sections: sections.map((s) => ({ section_id: s.id, course_code: s.course_code, title_en: s.title_en, section_no: s.section_no, credits: s.credits })), total_credits: credits } };
}

export interface SubmitResult { outcome: 'submitted' | 'partial' | 'failed' | 'outcome_unknown' | 'replayed'; proposal: ProposalView; receipt: EnrollmentReceipt | null; nextSteps: { resources: string[]; studySetup: boolean } | null; message: string }

export function submitProposal(user: User, id: string, approvalId: string, simulate?: SimulateMode): SubmitResult {
  const r = requireOwnProposal(user, id);
  const sectionIds = pj<string[]>(r.section_ids, []);
  const actionLog = pj<ActionLogEntry[]>(r.action_log, []);
  // Idempotent replay: a second click on an already-submitted proposal returns the same receipt.
  if (r.receipt && ['submitted', 'partial', 'failed'].includes(r.status as string)) {
    const rec = pj<EnrollmentReceipt & { nextSteps?: SubmitResult['nextSteps'] }>(r.receipt, null as never);
    return { outcome: 'replayed', proposal: proposalView(r), receipt: rec, nextSteps: rec.nextSteps ?? null, message: 'This proposal was already submitted; returning the stored receipt (no second enrolment).' };
  }
  const unknown = db().get(`SELECT id FROM enrollment_proposals WHERE student_id = ? AND status = 'outcome_unknown'`, user.id);
  if (unknown) throw conflict(`A previous submission (${unknown.id}) has an unknown outcome. Check its status before submitting again.`, { proposalId: unknown.id });
  if (r.status !== 'approved') throw conflict(`Proposal must be approved before submission (current status: ${r.status}).`);
  const expectedHash = payloadHash(r.term as string, sectionIds);
  const check = checkApproval(approvalId, { ownerId: user.id, entityId: id, payloadHash: expectedHash, revision: r.revision as number });
  if (check.result !== 'valid') {
    log(actionLog, 'approval_rejected', `Approval ${approvalId} rejected: ${check.result}.`);
    if (check.result === 'expired' || check.result === 'invalidated') db().update('enrollment_proposals', id, { status: 'needs_review', approval_id: null, action_log: j(actionLog), updated_at: nowIso() });
    else db().update('enrollment_proposals', id, { action_log: j(actionLog), updated_at: nowIso() });
    throw conflict(`Approval is ${check.result}. Review the proposal again before submitting.`, { approval: check.result });
  }
  const approval = check.approval!;
  // Demo: another student takes the last seat between approval and submission.
  if (simulate === 'stale_capacity') {
    const target = sectionIds.map((sid) => getSection(sid)).filter((s): s is SectionView => !!s).sort((a, b) => a.seats_left - b.seats_left)[0];
    if (target) { db().run('UPDATE course_sections SET enrolled = capacity WHERE id = ?', target.id); log(actionLog, 'simulate', `Demo: another student took the last seat in ${target.course_code} sec ${target.section_no}.`); }
  }
  // Revalidate live before commit.
  const ctx = studentContext(user.id);
  const sections = sectionIds.map((sid) => getSection(sid)).filter((s): s is SectionView => !!s);
  const prefs = pj<Preferences>(r.preferences, {});
  const { checks } = checkBasket(ctx, sections, prefs, analyzeEligibility(ctx, r.term as string, prefs), r.term as string, { currentTerm: CURRENT_TERM });
  const preview = previewEnrollment(sectionIds);
  const fails = hardFails(checks);
  if (fails.length || !preview.ok) {
    invalidateApprovals('enrollment', id);
    const why = fails.map((f) => `${f.label}: ${f.explanation}`).concat(preview.ok ? [] : ['Portal preview reports a closed or full section.']);
    log(actionLog, 'revalidation_failed', `Material change since approval — ${why.join('; ')}. Approval invalidated; proposal returned for review.`);
    db().update('enrollment_proposals', id, { status: 'needs_review', approval_id: null, checks: j(checks), action_log: j(actionLog), error: why.join('; '), updated_at: nowIso() });
    audit(user.id, 'academics.proposal.revalidation_failed', 'enrollment_proposal', id, { why });
    throw conflict(`The basket changed since you approved it: ${why.join('; ')}`, { proposal: proposalView(getProposalRow(id)), reason: 'stale' });
  }
  // Persist operation identity BEFORE calling the portal so a timeout can be reconciled.
  const operationId = (r.operation_id as string | null) ?? newOperationId();
  log(actionLog, 'submitting', `Submitting operation ${operationId} with idempotency key ${approval.idempotency_key}.`);
  db().update('enrollment_proposals', id, { status: 'submitting', operation_id: operationId, action_log: j(actionLog), updated_at: nowIso() });
  const result = submitEnrollment({ operationId, idempotencyKey: approval.idempotency_key, studentId: user.id, sectionIds, payloadHash: expectedHash, simulate });
  if (simulate === 'timeout') {
    const l2 = pj<ActionLogEntry[]>(getProposalRow(id).action_log, []);
    log(l2, 'timeout', 'Portal call timed out after the request was sent (simulated). Outcome unknown — use "Check status" to reconcile; a new submission is blocked meanwhile.');
    db().update('enrollment_proposals', id, { status: 'outcome_unknown', action_log: j(l2), updated_at: nowIso() });
    audit(user.id, 'academics.proposal.outcome_unknown', 'enrollment_proposal', id, { operationId });
    return { outcome: 'outcome_unknown', proposal: proposalView(getProposalRow(id)), receipt: null, nextSteps: null, message: 'The portal did not answer in time. The operation id is stored; check the status to reconcile.' };
  }
  return finalizeSubmission(user, id, result.receipt, result.replayed);
}

/** Applies the effects of a confirmed portal result exactly once. */
export function finalizeSubmission(user: User, id: string, receipt: EnrollmentReceipt, replayed = false): SubmitResult {
  return db().tx(() => {
    const r = getProposalRow(id);
    if (r.receipt) {
      const rec = pj<EnrollmentReceipt & { nextSteps?: SubmitResult['nextSteps'] }>(r.receipt, null as never);
      return { outcome: 'replayed' as const, proposal: proposalView(r), receipt: rec, nextSteps: rec.nextSteps ?? null, message: 'Already finalised; returning the stored receipt.' };
    }
    const actionLog = pj<ActionLogEntry[]>(r.action_log, []);
    const term = r.term as string;
    const enrolledIds = receipt.perSection.filter((p) => p.result === 'enrolled').map((p) => p.sectionId);
    const codes: string[] = [];
    for (const sid of enrolledIds) {
      const s = getSection(sid);
      if (!s) continue;
      codes.push(s.course_code);
      db().run(`INSERT OR IGNORE INTO transcript_entries (id, student_id, course_code, term, status, grade, credits, section_id, evidence, created_at) VALUES (?, ?, ?, ?, 'enrolled', NULL, ?, ?, NULL, ?)`, newId('tr'), user.id, s.course_code, term, s.credits, s.id, nowIso());
      if (TERM_DATES[term]) for (const occ of meetingOccurrences(s, term)) {
        upsertEntry(user.id, { source_type: 'section', source_id: `${s.id}:${occ.date}:${occ.start}`, title: `${s.course_code} · ${s.title_en}`, kind: 'class', start_at: localToIso(occ.date, occ.start), end_at: localToIso(occ.date, occ.end), location_id: occ.location_id, location_text: locationInfo(occ.location_id)?.name_en ?? null, immovable: true, link: '/academics/timetable', meta: { section_id: s.id, course_code: s.course_code } });
      }
    }
    const status = receipt.status === 'committed' ? 'submitted' : receipt.status === 'partial' ? 'partial' : 'failed';
    const nextSteps = { resources: codes, studySetup: codes.length > 0 };
    const failed = receipt.perSection.filter((p) => p.result !== 'enrolled');
    log(actionLog, 'receipt', `Portal ${receipt.status}: ${receipt.portalRef} — ${enrolledIds.length}/${receipt.perSection.length} sections enrolled${failed.length ? ` (${failed.map((f) => `${f.sectionId}: ${f.result}`).join(', ')})` : ''}.${replayed ? ' (idempotent replay)' : ''}`);
    log(actionLog, 'effects', codes.length ? `Timetable updated for ${term}: ${codes.join(', ')}. Calendar entries created once; study setup offered.` : 'No timetable changes.');
    if (r.approval_id) consumeApproval(r.approval_id as string);
    db().update('enrollment_proposals', id, { status, receipt: j({ ...receipt, nextSteps }), action_log: j(actionLog), error: failed.length ? `${failed.length} section(s) not enrolled` : null, updated_at: nowIso() });
    notify(user.id, { module: 'academics', kind: status === 'submitted' ? 'enrollment_confirmed' : 'enrollment_partial', title: status === 'submitted' ? `Registration confirmed for ${termLabel(term).en}` : `Registration ${status} for ${termLabel(term).en}`, body: `${receipt.label} ${receipt.portalRef}: ${codes.join(', ') || 'no sections enrolled'}${failed.length ? `; ${failed.length} section(s) failed` : ''}.`, link: `/academics/register?proposal=${id}` });
    audit(user.id, 'academics.proposal.finalized', 'enrollment_proposal', id, { status, portalRef: receipt.portalRef, enrolled: enrolledIds });
    return { outcome: status as SubmitResult['outcome'], proposal: proposalView(getProposalRow(id)), receipt: { ...receipt, nextSteps }, nextSteps, message: status === 'submitted' ? 'Enrolment confirmed by the demo portal.' : status === 'partial' ? 'Some sections could not be enrolled — the receipt lists each section.' : 'The portal rejected every section.' };
  });
}

export function reconcileProposal(user: User, id: string): SubmitResult | { outcome: 'still_unknown' | 'not_applicable'; proposal: ProposalView; message: string } {
  const r = requireOwnProposal(user, id);
  if (r.status !== 'outcome_unknown') return { outcome: 'not_applicable', proposal: proposalView(r), message: `Proposal is ${r.status}; nothing to reconcile.` };
  const st = getSubmissionStatus(r.operation_id as string);
  const actionLog = pj<ActionLogEntry[]>(r.action_log, []);
  if (st.found && st.receipt && st.status !== 'pending') {
    log(actionLog, 'reconciled', `Reconciled operation ${r.operation_id}: portal reports ${st.status}. Finalising once.`);
    db().update('enrollment_proposals', id, { action_log: j(actionLog), updated_at: nowIso() });
    return finalizeSubmission(user, id, st.receipt);
  }
  log(actionLog, 'reconcile_pending', `Operation ${r.operation_id} not confirmed yet (${st.status}). A delayed write may still complete; not resubmitting.`);
  db().update('enrollment_proposals', id, { action_log: j(actionLog), updated_at: nowIso() });
  return { outcome: 'still_unknown', proposal: proposalView(getProposalRow(id)), message: 'The portal has not confirmed the operation yet. Try again shortly; do not resubmit.' };
}

/** Course-level view for /courses/:code and the plan page. */
export function prereqChain(code: string, programId: string | null): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  const walk = (c: string, depth: number) => {
    if (depth > 12) return;
    for (const g of prereqRule(c, programId).prereqs) { if (!seen.has(g.join('|'))) { seen.add(g.join('|')); out.push(g); } for (const x of g) walk(x, depth + 1); }
  };
  walk(code, 0);
  return out;
}
