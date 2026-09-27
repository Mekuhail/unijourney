import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { User } from '../../../shared/types.ts';
import { db, pj } from '../../core/db.ts';
import { h, ok, parse, bad, conflict, forbidden, gone, notFound, unprocessable } from '../../core/http.ts';
import { requireCapability } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { addDays, nowIso, todayIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { CURRENT_TERM, NEXT_TERM } from '../../core/settings.ts';
import { getSection, studentContext, type SectionView } from './common.ts';
import { analyzeEligibility, checkBasket, hardFails, type Preferences } from './planner.ts';
import { requireOwnProposal, updateProposal, proposalView } from './registration.ts';

/**
 * Section comparison and voluntary coordination with classmates, before final registration.
 *
 * - Comparing sections is read-only: the saved basket never changes until the student applies a switch.
 * - Classmates connect only with a one-time invite code one of them shares in person; there is no directory.
 *   Once linked, each side chooses which courses to share (nothing by default) and sees only those.
 * - A suggested section is not a seat reservation and never changes anyone else's basket. Each student applies
 *   their own change, after a fresh check of seats, conflicts, credits, campus, prerequisites and the basket
 *   revision; the change invalidates their previous approval, so the exact list must be reviewed again.
 */
export const peersRouter = Router();

const firstName = (id: string) => {
  const u = db().get<{ name_en: string; name_ar: string; avatar_color: string }>('SELECT name_en, name_ar, avatar_color FROM users WHERE id = ?', id);
  return u ? { first_en: u.name_en.split(' ')[0], first_ar: u.name_ar.split(' ')[0], avatar_color: u.avatar_color } : { first_en: 'Classmate', first_ar: 'زميل', avatar_color: '#8f857b' };
};

/** The student's latest editable basket for a term (the one peers can compare against). */
function currentBasket(userId: string, term: string) {
  const r = db().get<{ id: string; section_ids: string; revision: number; status: string }>(
    "SELECT id, section_ids, revision, status FROM enrollment_proposals WHERE student_id = ? AND term = ? AND status IN ('draft','needs_review','approved') ORDER BY updated_at DESC LIMIT 1", userId, term);
  return r ? { id: r.id, revision: r.revision, sections: pj<string[]>(r.section_ids, []).map((s) => getSection(s)).filter((s): s is SectionView => !!s) } : null;
}

// ------------------------------------------------------------------ comparing sections (read-only)
export function compareSections(user: User, proposalId: string, courseCode: string) {
  const r = requireOwnProposal(user, proposalId);
  const term = r.term as string;
  const basketIds = pj<string[]>(r.section_ids, []);
  const basket = basketIds.map((id) => getSection(id)).filter((s): s is SectionView => !!s);
  const current = basket.find((s) => s.course_code === courseCode) ?? null;
  const ctx = studentContext(user.id);
  const prefs = pj<Preferences>(r.preferences, {});
  const elig = analyzeEligibility(ctx, term, prefs);
  const course = elig.find((e) => e.code === courseCode);
  const candidates = db().all<{ id: string }>("SELECT id FROM course_sections WHERE course_code = ? AND term = ? AND status <> 'cancelled' ORDER BY section_no", courseCode, term)
    .map((x) => getSection(x.id)).filter((s): s is SectionView => !!s);
  if (!candidates.length) throw notFound('No sections of this course run that term.');
  const others = basket.filter((s) => s.course_code !== courseCode);
  const base = checkBasket(ctx, basket, prefs, elig, term, { currentTerm: CURRENT_TERM });
  const baseFails = new Set(hardFails(base.checks).map((c) => c.id));
  const checkedAt = nowIso();
  const options = candidates.map((s) => {
    const trial = [...others, s];
    const res = checkBasket(ctx, trial, prefs, elig, term, { currentTerm: CURRENT_TERM });
    const fails = hardFails(res.checks);
    const warns = res.checks.filter((c) => c.status === 'warn');
    // Only problems this section causes (or fixes) matter for the comparison.
    const involves = (c: { explanation: string }) => c.explanation.includes(`${s.course_code} sec ${s.section_no}`) || c.explanation.includes(s.course_code);
    const conflicts = others.filter((o) => o.meetings.some((a) => s.meetings.some((b) => a.day === b.day && a.start < b.end && b.start < a.end))).map((o) => ({ course_code: o.course_code, section_no: o.section_no }));
    const travel = res.travel.filter((t) => t.status !== 'pass' && (t.from.startsWith(s.course_code) || t.to.startsWith(s.course_code)));
    const removed = current && current.id !== s.id ? current.meetings.filter((m) => !s.meetings.some((x) => x.day === m.day && x.start === m.start && x.end === m.end)) : [];
    const added = current && current.id !== s.id ? s.meetings.filter((m) => !current.meetings.some((x) => x.day === m.day && x.start === m.start && x.end === m.end)) : current ? [] : s.meetings;
    return {
      section: s,
      is_current: current?.id === s.id,
      seats: { left: s.seats_left, capacity: s.capacity, status: s.seats_left <= 0 ? 'full' : s.seats_left <= 2 ? 'few' : 'open', checked_at: checkedAt },
      campus_differs: s.campus_id !== (user.campus_id ?? 'riyadh'),
      conflicts,
      travel,
      credits_total: res.credits,
      hard_fails: fails.filter((c) => involves(c) || !baseFails.has(c.id)).map((c) => ({ id: c.id, label: c.label, explanation: c.explanation })),
      warnings: warns.filter(involves).map((c) => ({ id: c.id, label: c.label, explanation: c.explanation })),
      timetable_change: { removed, added },
      feasible: fails.length === 0
    };
  });
  return {
    proposal: { id: r.id as string, revision: r.revision as number, status: r.status as string },
    course: course ? { code: course.code, title_en: course.title_en, title_ar: course.title_ar, credits: course.credits, eligible: course.eligible, reasons: course.reasons, conditional: course.conditional } : { code: courseCode, title_en: courseCode, title_ar: courseCode, credits: candidates[0].credits, eligible: true, reasons: [], conditional: false },
    current: current?.id ?? null,
    options,
    peers: peerSharesFor(user.id, term, courseCode)
  };
}

peersRouter.get('/proposals/:id/compare', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const q = parse(z.object({ course: z.string().min(3).max(12) }), req.query);
  ok(res, compareSections(u, req.params.id as string, q.course));
}));

// ------------------------------------------------------------------ classmates
interface LinkRow { id: string; a_id: string; b_id: string; term: string; status: string; created_at: string }
const other = (l: LinkRow, me: string) => (l.a_id === me ? l.b_id : l.a_id);
function myLink(userId: string, linkId: string) {
  const l = db().get<LinkRow>('SELECT * FROM peer_links WHERE id = ?', linkId);
  // Anyone outside the link gets the same "not found" as a link that does not exist.
  if (!l || (l.a_id !== userId && l.b_id !== userId)) throw notFound('Link not found');
  return l;
}
function activeLinks(userId: string, term: string) {
  return db().all<LinkRow>("SELECT * FROM peer_links WHERE term = ? AND status = 'active' AND (a_id = ? OR b_id = ?) ORDER BY created_at", term, userId, userId);
}

/** What one linked classmate chose to share for a course: their current basket section for it, nothing else. */
function sharedSection(linkId: string, sharerId: string, term: string, courseCode: string) {
  const shared = db().get('SELECT 1 FROM peer_shares WHERE link_id = ? AND user_id = ? AND course_code = ?', linkId, sharerId, courseCode);
  if (!shared) return undefined;
  const b = currentBasket(sharerId, term);
  const s = b?.sections.find((x) => x.course_code === courseCode) ?? null;
  return s ? { id: s.id, section_no: s.section_no, instructor: s.instructor, meetings: s.meetings.map((m) => ({ day: m.day, start: m.start, end: m.end })), seats_left: s.seats_left } : null;
}

function peerSharesFor(userId: string, term: string, courseCode: string) {
  return activeLinks(userId, term).map((l) => {
    const peer = other(l, userId);
    const s = sharedSection(l.id, peer, term, courseCode);
    return s === undefined ? null : { link_id: l.id, peer: firstName(peer), section: s };
  }).filter(Boolean);
}

peersRouter.get('/peers', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const term = NEXT_TERM;
  const mine = currentBasket(u.id, term);
  const myCodes = mine?.sections.map((s) => s.course_code) ?? [];
  const links = activeLinks(u.id, term).map((l) => {
    const peer = other(l, u.id);
    const myShares = db().all<{ course_code: string }>('SELECT course_code FROM peer_shares WHERE link_id = ? AND user_id = ?', l.id, u.id).map((r) => r.course_code);
    const theirCodes = db().all<{ course_code: string }>('SELECT course_code FROM peer_shares WHERE link_id = ? AND user_id = ? ORDER BY course_code', l.id, peer).map((r) => r.course_code);
    const theirs = theirCodes.map((code) => ({ course_code: code, section: sharedSection(l.id, peer, term, code) ?? null }));
    // Overlaps only across courses both sides chose to share.
    const overlaps = theirs.filter((x) => myShares.includes(x.course_code)).map((x) => {
      const minePick = mine?.sections.find((s) => s.course_code === x.course_code) ?? null;
      return { course_code: x.course_code, mine: minePick ? { id: minePick.id, section_no: minePick.section_no } : null, theirs: x.section ? { id: x.section.id, section_no: x.section.section_no } : null, same: !!minePick && !!x.section && minePick.id === x.section.id };
    });
    return { id: l.id, peer: firstName(peer), since: l.created_at, my_shares: myShares, theirs, overlaps };
  });
  const invites = db().all<{ code: string; expires_at: string }>("SELECT code, expires_at FROM peer_invites WHERE owner_id = ? AND term = ? AND used_by IS NULL AND expires_at > ?", u.id, term, nowIso());
  const props = db().all<{ id: string; link_id: string; from_id: string; to_id: string; course_code: string; section_id: string; note: string | null; status: string; created_at: string; result: string | null }>(
    "SELECT p.* FROM peer_proposals p JOIN peer_links l ON l.id = p.link_id WHERE (p.from_id = ? OR p.to_id = ?) AND l.term = ? ORDER BY p.created_at DESC LIMIT 30", u.id, u.id, term);
  const view = (p: typeof props[number]) => { const s = getSection(p.section_id); return { id: p.id, link_id: p.link_id, course_code: p.course_code, section: s ? { id: s.id, section_no: s.section_no, instructor: s.instructor, meetings: s.meetings.map((m) => ({ day: m.day, start: m.start, end: m.end })), seats_left: s.seats_left } : null, note: p.note, status: p.status, created_at: p.created_at, peer: firstName(p.from_id === u.id ? p.to_id : p.from_id), result: pj(p.result, null) }; };
  ok(res, {
    term, basket: mine ? { id: mine.id, revision: mine.revision, courses: myCodes } : null,
    invites, links,
    incoming: props.filter((p) => p.to_id === u.id).map(view),
    outgoing: props.filter((p) => p.from_id === u.id).map(view)
  });
}));

peersRouter.post('/peers/invites', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const open = db().count('peer_invites', 'owner_id = ? AND used_by IS NULL AND expires_at > ?', u.id, nowIso());
  if (open >= 3) throw conflict('You already have 3 open invite codes. Cancel one first.');
  // Unambiguous characters, easy to read out loud.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
  const expires = `${addDays(todayIso(), 7)}T20:59:59.000Z`;
  db().insert('peer_invites', { code, owner_id: u.id, term: NEXT_TERM, created_at: nowIso(), expires_at: expires, used_by: null, used_at: null });
  audit(u.id, 'academics.peers.invite', 'peer_invite', code, {});
  ok(res, { code, expires_at: expires }, 201);
}));

peersRouter.delete('/peers/invites/:code', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const r = db().run('DELETE FROM peer_invites WHERE code = ? AND owner_id = ? AND used_by IS NULL', String(req.params.code).toUpperCase(), u.id);
  ok(res, { deleted: Number(r.changes) > 0 });
}));

peersRouter.post('/peers/redeem', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const b = parse(z.object({ code: z.string().trim().min(6).max(12), confirm: z.boolean().optional() }), req.body);
  const code = b.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const inv = db().get<{ code: string; owner_id: string; term: string; expires_at: string; used_by: string | null }>('SELECT * FROM peer_invites WHERE code = ?', code);
  if (!inv) throw notFound('That code does not exist. Check it with your classmate.');
  if (inv.used_by) throw gone('That code has already been used.');
  if (inv.expires_at <= nowIso()) throw gone('That code has expired. Ask for a new one.');
  if (inv.owner_id === u.id) throw bad('That is your own code. Share it with a classmate instead.');
  const exists = db().get("SELECT 1 FROM peer_links WHERE term = ? AND status = 'active' AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?))", inv.term, u.id, inv.owner_id, inv.owner_id, u.id);
  if (exists) throw conflict('You are already connected with this classmate.');
  // First call only says whose code it is; nothing is linked until the student confirms.
  if (!b.confirm) { ok(res, { preview: true, peer: firstName(inv.owner_id) }); return; }
  const id = newId('plink');
  db().tx(() => {
    db().insert('peer_links', { id, a_id: inv.owner_id, b_id: u.id, term: inv.term, status: 'active', created_at: nowIso(), revoked_by: null, revoked_at: null });
    db().run('UPDATE peer_invites SET used_by = ?, used_at = ? WHERE code = ?', u.id, nowIso(), code);
  });
  notify(inv.owner_id, { module: 'academics', kind: 'peer', title: `${firstName(u.id).first_en} used your invite code`, body: 'You are now connected for next term. Nothing is shared until each of you chooses courses to share.', link: '/academics/register?peers=1' });
  audit(u.id, 'academics.peers.link', 'peer_link', id, {});
  ok(res, { id, peer: firstName(inv.owner_id) }, 201);
}));

peersRouter.put('/peers/links/:id/shares', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const l = myLink(u.id, req.params.id as string);
  if (l.status !== 'active') throw gone('This connection was ended.');
  const b = parse(z.object({ courses: z.array(z.string().min(3).max(12)).max(12) }), req.body);
  const basket = currentBasket(u.id, l.term);
  const allowed = new Set(basket?.sections.map((s) => s.course_code) ?? []);
  const bad_ = b.courses.filter((c) => !allowed.has(c));
  if (bad_.length) throw unprocessable(`You can only share courses in your basket: ${bad_.join(', ')}`);
  db().tx(() => {
    db().run('DELETE FROM peer_shares WHERE link_id = ? AND user_id = ?', l.id, u.id);
    for (const c of new Set(b.courses)) db().insert('peer_shares', { link_id: l.id, user_id: u.id, course_code: c, created_at: nowIso() });
    // Suggestions about a course that is no longer shared are withdrawn.
    db().run("UPDATE peer_proposals SET status = 'withdrawn', updated_at = ? WHERE link_id = ? AND status = 'open' AND ((from_id = ? OR to_id = ?) AND course_code NOT IN (SELECT course_code FROM peer_shares WHERE link_id = ? AND user_id = ?))", nowIso(), l.id, u.id, u.id, l.id, u.id);
  });
  ok(res, { shares: [...new Set(b.courses)] });
}));

peersRouter.delete('/peers/links/:id', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const l = myLink(u.id, req.params.id as string);
  db().tx(() => {
    db().run("UPDATE peer_links SET status = 'revoked', revoked_by = ?, revoked_at = ? WHERE id = ?", u.id, nowIso(), l.id);
    db().run('DELETE FROM peer_shares WHERE link_id = ?', l.id);
    db().run("UPDATE peer_proposals SET status = 'withdrawn', updated_at = ? WHERE link_id = ? AND status = 'open'", nowIso(), l.id);
  });
  audit(u.id, 'academics.peers.revoke', 'peer_link', l.id, {});
  ok(res, { revoked: true });
}));

peersRouter.post('/peers/links/:id/proposals', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const l = myLink(u.id, req.params.id as string);
  if (l.status !== 'active') throw gone('This connection was ended.');
  const b = parse(z.object({ course_code: z.string().min(3).max(12), section_id: z.string().min(3).max(60), note: z.string().trim().max(200).optional() }), req.body);
  const peer = other(l, u.id);
  const s = getSection(b.section_id);
  if (!s || s.course_code !== b.course_code || s.term !== l.term) throw unprocessable('That section is not part of this course next term.');
  // Suggest only within what both chose to share.
  const both = db().get('SELECT 1 FROM peer_shares a JOIN peer_shares b ON a.link_id = b.link_id AND a.course_code = b.course_code WHERE a.link_id = ? AND a.user_id = ? AND b.user_id = ? AND a.course_code = ?', l.id, u.id, peer, b.course_code);
  if (!both) throw forbidden('You can suggest a section only for a course you have both chosen to share.');
  const dup = db().get("SELECT 1 FROM peer_proposals WHERE link_id = ? AND from_id = ? AND course_code = ? AND section_id = ? AND status = 'open'", l.id, u.id, b.course_code, b.section_id);
  if (dup) throw conflict('You already suggested this section.');
  const id = newId('pprop');
  db().insert('peer_proposals', { id, link_id: l.id, from_id: u.id, to_id: peer, course_code: b.course_code, section_id: b.section_id, note: b.note ?? null, status: 'open', created_at: nowIso(), updated_at: nowIso(), result: null });
  notify(peer, { module: 'academics', kind: 'peer', title: `${firstName(u.id).first_en} suggested ${b.course_code} section ${s.section_no}`, body: 'A suggestion only: your basket changes only if you review and accept it.', link: '/academics/register?peers=1' });
  ok(res, { id }, 201);
}));

function ownPeerProposal(userId: string, id: string, as: 'to' | 'from') {
  const p = db().get<{ id: string; link_id: string; from_id: string; to_id: string; course_code: string; section_id: string; status: string }>('SELECT * FROM peer_proposals WHERE id = ?', id);
  if (!p || (as === 'to' ? p.to_id : p.from_id) !== userId) throw notFound('Suggestion not found');
  return p;
}

peersRouter.post('/peers/proposals/:id/decline', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const p = ownPeerProposal(u.id, req.params.id as string, 'to');
  if (p.status !== 'open') throw conflict(`This suggestion is already ${p.status}.`);
  db().run("UPDATE peer_proposals SET status = 'declined', updated_at = ? WHERE id = ?", nowIso(), p.id);
  ok(res, { status: 'declined' });
}));

peersRouter.post('/peers/proposals/:id/withdraw', h((req, res) => {
  const u = requireCapability(req, 'registration');
  const p = ownPeerProposal(u.id, req.params.id as string, 'from');
  if (p.status !== 'open') throw conflict(`This suggestion is already ${p.status}.`);
  db().run("UPDATE peer_proposals SET status = 'withdrawn', updated_at = ? WHERE id = ?", nowIso(), p.id);
  ok(res, { status: 'withdrawn' });
}));

/** Apply a classmate's suggestion to *my* basket only, after re-checking everything against the live data. */
peersRouter.post('/peers/proposals/:id/apply', h(async (req, res) => {
  const u = requireCapability(req, 'registration');
  const b = parse(z.object({ proposalId: z.string().min(3), expectedRevision: z.number().int().min(1) }), req.body);
  const p = ownPeerProposal(u.id, req.params.id as string, 'to');
  if (p.status !== 'open') throw conflict(`This suggestion is already ${p.status}.`);
  const l = myLink(u.id, p.link_id);
  if (l.status !== 'active') throw gone('This connection was ended, so the suggestion no longer applies.');
  const r = requireOwnProposal(u, b.proposalId);
  if (r.term !== l.term) throw unprocessable('That basket is for a different term.');
  if (r.revision !== b.expectedRevision) throw conflict('Your basket changed since you reviewed this suggestion. Review it again.', { revision: r.revision });
  const s = getSection(p.section_id);
  if (!s) throw gone('That section no longer exists.');
  if (s.seats_left <= 0) throw conflict(`${s.course_code} section ${s.section_no} is full now.`, { seats_left: 0 });
  const ids = pj<string[]>(r.section_ids, []);
  const currentSame = ids.map((x) => getSection(x)).find((x) => x?.course_code === s.course_code) ?? null;
  if (currentSame?.id === s.id) throw conflict('You are already in that section.');
  const cmp = compareSections(u, r.id as string, s.course_code).options.find((o) => o.section.id === s.id);
  if (!cmp || !cmp.feasible) throw unprocessable('This section does not fit your basket.', { fails: cmp?.hard_fails ?? [] });
  const patch = currentSame ? { swap: { from: currentSame.id, to: s.id } } : { add: s.id };
  const out = await updateProposal(u, r.id as string, patch);
  const result = { applied_at: nowIso(), from: currentSame?.id ?? null, to: s.id, proposal_revision: out.proposal.revision };
  db().run("UPDATE peer_proposals SET status = 'accepted', updated_at = ?, result = ? WHERE id = ?", nowIso(), JSON.stringify(result), p.id);
  notify(p.from_id, { module: 'academics', kind: 'peer', title: `${firstName(u.id).first_en} accepted your suggestion for ${s.course_code}`, body: 'It changed their basket only. Your own basket is unchanged.', link: '/academics/register?peers=1' });
  audit(u.id, 'academics.peers.apply', 'peer_proposal', p.id, result);
  ok(res, { proposal: out.proposal, undo: currentSame ? { swap: { from: s.id, to: currentSame.id } } : { remove: s.id } });
}));

export { proposalView };
