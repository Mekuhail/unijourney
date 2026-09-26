import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import { db, pj } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, conflict, unprocessable, HttpError } from '../../core/http.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { newId, stableHash } from '../../core/ids.ts';
import { addDays, now, nowIso, todayIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { config } from '../../core/config.ts';
import { checkText } from '../../core/moderation.ts';
import { getClub, getEvent, isLeadOf, nowLocalIso, userBrief, type ClubRow } from './shared.ts';

/**
 * Club community: announcements, member discussions, questions with accepted answers, polls, reactions, comments,
 * follow-without-joining, officer titles, reports with a lead moderation queue, and QR self check-in at events.
 *
 * Visibility: announcements are readable by every signed-in user; discussions, questions and polls only by active
 * members and the club's moderators. The full roster is members-only; officers and the member count are public.
 */
export const communityRouter = Router();

// ------------------------------------------------------------------ taxonomy
/** Interest tags shared by club profiles and student interests. Keys are the lower-case interest strings. */
export const CLUB_TAGS: Record<string, { en: string; ar: string }> = {
  'web development': { en: 'Web development', ar: 'تطوير الويب' },
  ai: { en: 'AI', ar: 'الذكاء الاصطناعي' },
  games: { en: 'Game development', ar: 'تطوير الألعاب' },
  iot: { en: 'IoT', ar: 'إنترنت الأشياء' },
  robotics: { en: 'Robotics', ar: 'الروبوتات' },
  cloud: { en: 'Cloud', ar: 'الحوسبة السحابية' },
  hackathons: { en: 'Hackathons', ar: 'الهاكاثونات' },
  cybersecurity: { en: 'Cybersecurity', ar: 'الأمن السيبراني' },
  ctf: { en: 'CTF', ar: 'مسابقات التقاط العلم' },
  networking: { en: 'Networking', ar: 'الشبكات' },
  'competitive programming': { en: 'Competitive programming', ar: 'البرمجة التنافسية' },
  algorithms: { en: 'Algorithms', ar: 'الخوارزميات' },
  entrepreneurship: { en: 'Entrepreneurship', ar: 'ريادة الأعمال' },
  fintech: { en: 'Fintech', ar: 'التقنية المالية' },
  startups: { en: 'Startups', ar: 'الشركات الناشئة' },
  debate: { en: 'Debate', ar: 'المناظرة' },
  'public speaking': { en: 'Public speaking', ar: 'الخطابة' },
  law: { en: 'Law', ar: 'القانون' },
  'moot court': { en: 'Moot court', ar: 'المحكمة الصورية' },
  photography: { en: 'Photography', ar: 'التصوير' },
  design: { en: 'Design', ar: 'التصميم' },
  'ui/ux': { en: 'UI/UX', ar: 'تجربة المستخدم' },
  architecture: { en: 'Architecture', ar: 'العمارة' },
  volunteering: { en: 'Volunteering', ar: 'التطوع' },
  community: { en: 'Community', ar: 'المجتمع' },
  sustainability: { en: 'Sustainability', ar: 'الاستدامة' },
  data: { en: 'Data', ar: 'البيانات' }
};
export const tagView = (key: string) => ({ key, ...(CLUB_TAGS[key] ?? { en: key, ar: key }) });

// ------------------------------------------------------------------ roles
export type ClubRole = 'lead' | 'officer' | 'member';

interface MembershipRow { id: string; club_id: string; user_id: string; status: string; role: string }

export function activeMembership(clubId: string, userId: string): MembershipRow | null {
  return db().get<MembershipRow>("SELECT * FROM memberships WHERE club_id = ? AND user_id = ? AND status = 'active'", clubId, userId) ?? null;
}

/** Moderators: the club's lead (club_lead role + lead_id) and active members holding the lead or officer role. */
export function canModerate(u: User, club: ClubRow): boolean {
  if (isLeadOf(u, club)) return true;
  const role = activeMembership(club.id, u.id)?.role;
  return role === 'officer' || role === 'lead';
}

function isMember(u: User, club: ClubRow) {
  return !!activeMembership(club.id, u.id) || isLeadOf(u, club);
}

export function profileOf(clubId: string) {
  const p = db().get('SELECT * FROM club_profiles WHERE club_id = ?', clubId);
  return {
    tagline_en: (p?.tagline_en as string) ?? '', tagline_ar: (p?.tagline_ar as string) ?? '',
    tags: pj<string[]>(p?.tags as string | undefined, []).map(tagView),
    meets_en: (p?.meets_en as string) ?? '', meets_ar: (p?.meets_ar as string) ?? '',
    join_policy: ((p?.join_policy as string) ?? 'approval') as 'open' | 'approval',
    join_question_en: (p?.join_question_en as string | null) ?? null, join_question_ar: (p?.join_question_ar as string | null) ?? null,
    founded: (p?.founded as string | null) ?? null,
    audience: ((p?.audience as string) ?? 'all') as 'all' | 'riyadh' | 'khobar'
  };
}

/** Lead and officers with their titles; public on every club page. */
export function officersOf(club: ClubRow) {
  return db().all(`SELECT m.id AS membership_id, m.user_id, m.role, t.title_en, t.title_ar, u.name_en, u.name_ar, u.avatar_color, u.program_id
    FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN club_member_titles t ON t.membership_id = m.id
    WHERE m.club_id = ? AND m.status = 'active' AND m.role IN ('lead','officer') ORDER BY CASE m.role WHEN 'lead' THEN 0 ELSE 1 END, m.requested_at`, club.id);
}

export function isFollowing(clubId: string, userId: string) {
  return !!db().get('SELECT 1 FROM club_follows WHERE club_id = ? AND user_id = ?', clubId, userId);
}

/** Community fields added to every club view. */
export function communitySummary(club: ClubRow, u: User) {
  const next = db().get("SELECT id, title_en, title_ar, start_at FROM events WHERE club_id = ? AND end_at >= ? AND status <> 'cancelled' ORDER BY start_at LIMIT 1", club.id, nowLocalIso());
  const weekAgo = new Date(now().getTime() - 7 * 864e5).toISOString();
  return {
    profile: profileOf(club.id),
    officers: officersOf(club),
    following: isFollowing(club.id, u.id),
    follower_count: db().count('club_follows', 'club_id = ?', club.id),
    next_event: next ?? null,
    posts_this_week: db().count('club_posts', 'club_id = ? AND removed_at IS NULL AND created_at >= ?', club.id, weekAgo),
    can_moderate: canModerate(u, club)
  };
}

/**
 * "For you" ranking, rule-based and explainable: shared interests weigh most, then same campus, classmates from the
 * same programme who are members, and an event coming up. Clubs the student already belongs to are not suggested.
 */
export function recommendFor(club: ClubRow, u: User) {
  const mine = db().get("SELECT status FROM memberships WHERE club_id = ? AND user_id = ? AND status IN ('active','pending')", club.id, u.id);
  if (mine) return null;
  const profile = profileOf(club.id);
  const interests = new Set(u.interests.map((i) => i.toLowerCase()));
  const shared = profile.tags.filter((tg) => interests.has(tg.key));
  const sameCampus = club.campus_id === u.campus_id || profile.audience === 'all';
  const peers = u.program_id ? db().count('memberships m JOIN users x ON x.id = m.user_id', "m.club_id = ? AND m.status = 'active' AND x.program_id = ? AND x.id <> ?", club.id, u.program_id, u.id) : 0;
  const soon = db().count('events', "club_id = ? AND start_at >= ? AND start_at <= ? AND status <> 'cancelled'", club.id, nowLocalIso(), `${addDays(todayIso(), 14)}T23:59`);
  const score = shared.length * 3 + (club.campus_id === u.campus_id ? 1 : 0) + Math.min(peers, 3) * 0.5 + (soon ? 0.5 : 0);
  const reasons: Array<{ key: string; params: Record<string, string | number> }> = [];
  if (shared.length) reasons.push({ key: 'campus.forYou.interests', params: { list_en: shared.map((s) => s.en).join(', '), list_ar: shared.map((s) => s.ar).join('، ') } });
  if (peers) reasons.push({ key: 'campus.forYou.peers', params: { n: peers } });
  if (soon) reasons.push({ key: 'campus.forYou.soon', params: { n: soon } });
  return { score, reasons, same_campus: sameCampus };
}

// ------------------------------------------------------------------ posts
interface PostRow { id: string; club_id: string; author_id: string; kind: string; body: string; event_id: string | null; pinned_until: string | null; answer_comment_id: string | null; hidden: number; created_at: string; edited_at: string | null; removed_at: string | null; removed_by: string | null; removed_reason: string | null }

const PUBLIC_KINDS = new Set(['announcement']);

function getPost(club: ClubRow, postId: string): PostRow {
  const p = db().get<PostRow>('SELECT * FROM club_posts WHERE id = ? AND club_id = ? AND removed_at IS NULL', postId, club.id);
  if (!p) throw notFound('Post not found');
  return p;
}

function canSee(u: User, club: ClubRow, p: PostRow) {
  if (p.hidden && !canModerate(u, club) && p.author_id !== u.id) return false;
  return PUBLIC_KINDS.has(p.kind) || isMember(u, club);
}

function requireVisible(u: User, club: ClubRow, p: PostRow) {
  if (!canSee(u, club, p)) throw forbidden('Join the club to see member posts');
}

function authorView(clubId: string, userId: string) {
  const b = userBrief(userId);
  const m = db().get("SELECT m.role, t.title_en, t.title_ar FROM memberships m LEFT JOIN club_member_titles t ON t.membership_id = m.id WHERE m.club_id = ? AND m.user_id = ? AND m.status = 'active'", clubId, userId);
  return b ? { id: b.id, name_en: b.name_en, name_ar: b.name_ar, avatar_color: b.avatar_color, program_id: b.program_id, role: (m?.role as ClubRole | undefined) ?? null, title_en: (m?.title_en as string | null) ?? null, title_ar: (m?.title_ar as string | null) ?? null } : null;
}

function isPinned(p: PostRow) {
  return !!p.pinned_until && p.pinned_until >= nowIso();
}

export function postView(p: PostRow, club: ClubRow, u: User) {
  const mod = canModerate(u, club);
  const member = isMember(u, club);
  const comments = db().all<{ id: string; author_id: string; body: string; created_at: string }>('SELECT id, author_id, body, created_at FROM club_comments WHERE post_id = ? AND removed_at IS NULL ORDER BY created_at, rowid', p.id)
    .map((c) => ({ ...c, author: authorView(club.id, c.author_id), is_answer: p.answer_comment_id === c.id, can_delete: c.author_id === u.id || mod }));
  let poll = null;
  if (p.kind === 'poll') {
    const options = db().all<{ id: string; label: string }>('SELECT id, label FROM club_poll_options WHERE post_id = ? ORDER BY sort', p.id);
    const my = db().get<{ option_id: string }>('SELECT option_id FROM club_poll_votes WHERE post_id = ? AND user_id = ?', p.id, u.id);
    const total = db().count('club_poll_votes', 'post_id = ?', p.id);
    const reveal = !!my || mod || p.author_id === u.id;
    poll = { total, my_vote: my?.option_id ?? null, options: options.map((o) => ({ ...o, votes: reveal ? db().count('club_poll_votes', 'option_id = ?', o.id) : null })) };
  }
  const event = p.event_id ? db().get('SELECT id, title_en, title_ar, start_at, end_at FROM events WHERE id = ?', p.event_id) ?? null : null;
  return {
    id: p.id, club_id: p.club_id, kind: p.kind, body: p.body, created_at: p.created_at, edited_at: p.edited_at,
    pinned: isPinned(p), pinned_until: p.pinned_until, hidden: !!p.hidden,
    author: authorView(club.id, p.author_id),
    event,
    reactions: db().count('club_reactions', 'post_id = ?', p.id),
    reacted: !!db().get('SELECT 1 FROM club_reactions WHERE post_id = ? AND user_id = ?', p.id, u.id),
    comments,
    answer_comment_id: p.answer_comment_id,
    poll,
    can: {
      edit: p.author_id === u.id && p.kind !== 'poll',
      delete: p.author_id === u.id || mod,
      pin: mod && p.kind === 'announcement',
      comment: member,
      react: member || p.kind === 'announcement',
      vote: member && p.kind === 'poll',
      accept: p.kind === 'question' && (p.author_id === u.id || mod),
      report: p.author_id !== u.id
    }
  };
}

function clubMembersToNotify(club: ClubRow, exceptId: string) {
  return db().all<{ user_id: string }>("SELECT user_id FROM memberships WHERE club_id = ? AND status = 'active' AND user_id <> ?", club.id, exceptId).map((r) => r.user_id);
}

function moderatorsOf(club: ClubRow) {
  const ids = new Set<string>(db().all<{ user_id: string }>("SELECT user_id FROM memberships WHERE club_id = ? AND status = 'active' AND role IN ('lead','officer')", club.id).map((r) => r.user_id));
  if (club.lead_id) ids.add(club.lead_id);
  return [...ids];
}

function rateLimited(message: string) {
  return new HttpError(429, 'rate_limited', message);
}

function assertCleanText(text: string) {
  const c = checkText(text);
  if (c.blocking) throw unprocessable(c.flags.includes('abusive') ? 'Please rephrase: the text contains language that breaks the community guidelines.' : 'Please remove phone numbers, email addresses or student numbers before posting.', { flags: c.flags });
  return c;
}

communityRouter.get('/clubs/:id/posts', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const kind = typeof req.query.kind === 'string' && req.query.kind ? req.query.kind : null;
  const rows = db().all<PostRow>(`SELECT * FROM club_posts WHERE club_id = ? AND removed_at IS NULL ${kind ? 'AND kind = ?' : ''} ORDER BY created_at DESC, rowid DESC`, ...(kind ? [club.id, kind] : [club.id]));
  const visible = rows.filter((p) => canSee(u, club, p));
  const hiddenForNonMembers = rows.filter((p) => !PUBLIC_KINDS.has(p.kind) && !isMember(u, club)).length;
  const mod = canModerate(u, club);
  const member = isMember(u, club);
  const views = visible.map((p) => postView(p, club, u));
  ok(res, {
    pinned: views.filter((p) => p.pinned).slice(0, 3),
    items: views.filter((p) => !p.pinned),
    members_only_hidden: hiddenForNonMembers,
    can_post: { announcement: mod, discussion: member, question: member, poll: mod },
    open_reports: mod ? db().count('club_reports', "club_id = ? AND status = 'open'", club.id) : 0
  });
}));

const postBody = z.object({
  kind: z.enum(['announcement', 'discussion', 'question', 'poll']),
  body: z.string().trim().min(2).max(1500),
  event_id: z.string().optional().nullable(),
  pin: z.boolean().optional(),
  notify: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5).optional()
});

communityRouter.post('/clubs/:id/posts', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const body = parse(postBody, req.body);
  const mod = canModerate(u, club);
  if ((body.kind === 'announcement' || body.kind === 'poll') && !mod) throw forbidden('Only the club lead and officers can post announcements and polls');
  if (!isMember(u, club)) throw forbidden('Join the club to post');
  if (body.kind === 'poll' && !body.options) throw unprocessable('A poll needs 2 to 5 options');
  if (body.event_id) {
    const e = getEvent(body.event_id);
    if (e.club_id !== club.id) throw unprocessable('Link an event from this club');
  }
  // Slow mode: 6 posts per member per club per hour (Discord-style), moderators exempt.
  const hourAgo = new Date(now().getTime() - 3600e3).toISOString();
  if (!mod && db().count('club_posts', 'club_id = ? AND author_id = ? AND created_at >= ?', club.id, u.id, hourAgo) >= 6) throw rateLimited('Slow mode: you can post again in a little while.');
  const text = assertCleanText([body.body, ...(body.options ?? [])].join('\n'));
  if (body.pin && db().count('club_posts', 'club_id = ? AND removed_at IS NULL AND pinned_until >= ?', club.id, nowIso()) >= 3) throw conflict('Three posts are already pinned. Unpin one first.');
  const id = newId('post');
  const at = nowIso();
  db().tx(() => {
    db().insert('club_posts', {
      id, club_id: club.id, author_id: u.id, kind: body.kind, body: body.body, event_id: body.event_id ?? null,
      pinned_until: body.pin && body.kind === 'announcement' ? `${addDays(todayIso(), 14)}T20:59:59.000Z` : null,
      answer_comment_id: null, hidden: text.flags.includes('links') ? 1 : 0, created_at: at, edited_at: null, removed_at: null, removed_by: null, removed_reason: null
    });
    (body.options ?? []).forEach((label, i) => db().insert('club_poll_options', { id: `${id}_o${i + 1}`, post_id: id, label, sort: i }));
    if ((body.kind === 'announcement' || body.kind === 'poll') && body.notify !== false) {
      for (const m of clubMembersToNotify(club, u.id)) notify(m, { module: 'campus', kind: 'club_announcement', title: `${club.name_en}: ${body.kind === 'poll' ? 'new poll' : 'announcement'}`, body: body.body.slice(0, 140), link: `/campus/clubs/${club.id}?post=${id}` });
    }
    audit(u.id, 'club.post.create', 'club_post', id, { club_id: club.id, kind: body.kind });
  });
  ok(res, postView(getPost(club, id), club, u), 201);
}));

communityRouter.patch('/clubs/:id/posts/:postId', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  const body = parse(z.object({ body: z.string().trim().min(2).max(1500).optional(), pinned: z.boolean().optional() }), req.body);
  if (body.body !== undefined) {
    if (p.author_id !== u.id) throw forbidden('Only the author can edit a post');
    if (p.kind === 'poll') throw conflict('Polls cannot be edited once posted');
    assertCleanText(body.body);
    db().update('club_posts', p.id, { body: body.body, edited_at: nowIso() });
  }
  if (body.pinned !== undefined) {
    if (!canModerate(u, club)) throw forbidden('Only the club lead and officers can pin posts');
    if (p.kind !== 'announcement') throw conflict('Only announcements can be pinned');
    if (body.pinned && !isPinned(p) && db().count('club_posts', 'club_id = ? AND removed_at IS NULL AND pinned_until >= ?', club.id, nowIso()) >= 3) throw conflict('Three posts are already pinned. Unpin one first.');
    db().update('club_posts', p.id, { pinned_until: body.pinned ? `${addDays(todayIso(), 14)}T20:59:59.000Z` : null });
    audit(u.id, body.pinned ? 'club.post.pin' : 'club.post.unpin', 'club_post', p.id, {});
  }
  ok(res, postView(getPost(club, p.id), club, u));
}));

communityRouter.delete('/clubs/:id/posts/:postId', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  const own = p.author_id === u.id;
  if (!own && !canModerate(u, club)) throw forbidden('Only the author or a club moderator can remove a post');
  const reason = typeof req.query.reason === 'string' ? req.query.reason.slice(0, 200) : null;
  db().tx(() => {
    db().update('club_posts', p.id, { removed_at: nowIso(), removed_by: u.id, removed_reason: own ? 'author' : (reason ?? 'moderator') });
    db().run("UPDATE club_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE post_id = ? AND status = 'open'", nowIso(), u.id, p.id);
    if (!own) notify(p.author_id, { module: 'campus', kind: 'club_moderation', title: `Your post in ${club.name_en} was removed`, body: reason ? `Reason: ${reason}` : 'A club moderator removed it under the community guidelines.', link: `/campus/clubs/${club.id}` });
    audit(u.id, own ? 'club.post.delete' : 'club.post.remove', 'club_post', p.id, { reason });
  });
  ok(res, { id: p.id, removed: true });
}));

communityRouter.post('/clubs/:id/posts/:postId/react', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  requireVisible(u, club, p);
  if (!isMember(u, club) && p.kind !== 'announcement') throw forbidden('Join the club to react');
  const existing = db().get('SELECT 1 FROM club_reactions WHERE post_id = ? AND user_id = ?', p.id, u.id);
  if (existing) db().run('DELETE FROM club_reactions WHERE post_id = ? AND user_id = ?', p.id, u.id);
  else db().insert('club_reactions', { post_id: p.id, user_id: u.id, created_at: nowIso() });
  ok(res, { reacted: !existing, count: db().count('club_reactions', 'post_id = ?', p.id) });
}));

communityRouter.post('/clubs/:id/posts/:postId/comments', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  requireVisible(u, club, p);
  if (!isMember(u, club)) throw forbidden('Join the club to reply');
  const body = parse(z.object({ body: z.string().trim().min(1).max(600) }), req.body);
  assertCleanText(body.body);
  const minuteAgo = new Date(now().getTime() - 60e3).toISOString();
  if (!canModerate(u, club) && db().count('club_comments', 'author_id = ? AND created_at >= ?', u.id, minuteAgo) >= 10) throw rateLimited('Slow mode: wait a moment before replying again.');
  const id = newId('cmt');
  db().tx(() => {
    db().insert('club_comments', { id, post_id: p.id, author_id: u.id, body: body.body, created_at: nowIso(), removed_at: null, removed_by: null });
    if (p.author_id !== u.id) notify(p.author_id, { module: 'campus', kind: 'club_reply', title: `${u.name_en} replied in ${club.name_en}`, body: body.body.slice(0, 140), link: `/campus/clubs/${club.id}?post=${p.id}` });
  });
  ok(res, postView(getPost(club, p.id), club, u), 201);
}));

communityRouter.delete('/clubs/:id/posts/:postId/comments/:commentId', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  const c = db().get<{ id: string; author_id: string }>('SELECT id, author_id FROM club_comments WHERE id = ? AND post_id = ? AND removed_at IS NULL', req.params.commentId as string, p.id);
  if (!c) throw notFound('Reply not found');
  if (c.author_id !== u.id && !canModerate(u, club)) throw forbidden('Only the author or a club moderator can remove a reply');
  db().tx(() => {
    db().update('club_comments', c.id, { removed_at: nowIso(), removed_by: u.id });
    if (p.answer_comment_id === c.id) db().update('club_posts', p.id, { answer_comment_id: null });
    db().run("UPDATE club_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE comment_id = ? AND status = 'open'", nowIso(), u.id, c.id);
  });
  ok(res, postView(getPost(club, p.id), club, u));
}));

communityRouter.post('/clubs/:id/posts/:postId/answer', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  if (p.kind !== 'question') throw conflict('Only questions have an accepted answer');
  if (p.author_id !== u.id && !canModerate(u, club)) throw forbidden('Only the person who asked or a moderator can accept an answer');
  const body = parse(z.object({ comment_id: z.string().nullable() }), req.body);
  if (body.comment_id && !db().get('SELECT 1 FROM club_comments WHERE id = ? AND post_id = ? AND removed_at IS NULL', body.comment_id, p.id)) throw notFound('Reply not found');
  db().update('club_posts', p.id, { answer_comment_id: body.comment_id });
  const c = body.comment_id ? db().get<{ author_id: string }>('SELECT author_id FROM club_comments WHERE id = ?', body.comment_id) : null;
  if (c && c.author_id !== u.id) notify(c.author_id, { module: 'campus', kind: 'club_answer', title: `Your reply was marked as the answer in ${club.name_en}`, link: `/campus/clubs/${club.id}?post=${p.id}` });
  ok(res, postView(getPost(club, p.id), club, u));
}));

communityRouter.post('/clubs/:id/posts/:postId/vote', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  if (p.kind !== 'poll') throw conflict('This post is not a poll');
  if (!isMember(u, club)) throw forbidden('Join the club to vote');
  const body = parse(z.object({ option_id: z.string() }), req.body);
  if (!db().get('SELECT 1 FROM club_poll_options WHERE id = ? AND post_id = ?', body.option_id, p.id)) throw notFound('Option not found');
  db().run('INSERT INTO club_poll_votes (post_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET option_id = excluded.option_id, created_at = excluded.created_at', p.id, body.option_id, u.id, nowIso());
  ok(res, postView(getPost(club, p.id), club, u));
}));

// ------------------------------------------------------------------ reports & moderation
const REPORT_HIDE_THRESHOLD = 3;

communityRouter.post('/clubs/:id/posts/:postId/report', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  const p = getPost(club, req.params.postId as string);
  const body = parse(z.object({ reason: z.enum(['spam', 'harassment', 'off_topic', 'personal_info', 'other']), note: z.string().trim().max(300).optional(), comment_id: z.string().optional() }), req.body);
  const dupe = db().get("SELECT id FROM club_reports WHERE post_id = ? AND IFNULL(comment_id, '') = ? AND reporter_id = ?", p.id, body.comment_id ?? '', u.id);
  if (dupe) return ok(res, { id: dupe.id, created: false });
  requireVisible(u, club, p);
  if (body.comment_id && !db().get('SELECT 1 FROM club_comments WHERE id = ? AND post_id = ? AND removed_at IS NULL', body.comment_id, p.id)) throw notFound('Reply not found');
  const target = body.comment_id ? db().get<{ author_id: string }>('SELECT author_id FROM club_comments WHERE id = ?', body.comment_id)! : p;
  if (target.author_id === u.id) throw conflict('You cannot report your own post');
  const id = newId('rep');
  db().tx(() => {
    db().insert('club_reports', { id, club_id: club.id, post_id: p.id, comment_id: body.comment_id ?? null, reporter_id: u.id, reason: body.reason, note: body.note ?? null, status: 'open', created_at: nowIso(), resolved_at: null, resolved_by: null });
    const reporters = db().count('club_reports', "post_id = ? AND comment_id IS NULL AND status = 'open'", p.id);
    if (!body.comment_id && reporters >= REPORT_HIDE_THRESHOLD && !p.hidden) db().update('club_posts', p.id, { hidden: 1 });
    for (const m of moderatorsOf(club)) notify(m, { module: 'campus', kind: 'club_report', title: `Post reported in ${club.name_en}`, body: `Reason: ${body.reason.replace('_', ' ')}`, link: `/campus/clubs/${club.id}?tab=moderation` });
    audit(u.id, 'club.report', 'club_post', p.id, { reason: body.reason, comment_id: body.comment_id ?? null });
  });
  ok(res, { id, created: true }, 201);
}));

communityRouter.get('/clubs/:id/reports', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  if (!canModerate(u, club)) throw forbidden('Only the club lead and officers can see reports');
  const rows = db().all(`SELECT r.id, r.post_id, r.comment_id, r.reason, r.note, r.status, r.created_at,
      p.body AS post_body, p.kind AS post_kind, p.hidden, p.author_id AS post_author_id, c.body AS comment_body, c.author_id AS comment_author_id
    FROM club_reports r JOIN club_posts p ON p.id = r.post_id LEFT JOIN club_comments c ON c.id = r.comment_id
    WHERE r.club_id = ? AND r.status = 'open' ORDER BY r.created_at DESC, r.rowid DESC`, club.id);
  // Reporter identity stays with the platform; moderators see the reason, not who reported.
  ok(res, rows.map((r) => ({ ...r, hidden: !!r.hidden, author: userBrief((r.comment_author_id ?? r.post_author_id) as string) })));
}));

communityRouter.post('/clubs/:id/reports/:reportId/resolve', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  if (!canModerate(u, club)) throw forbidden('Only the club lead and officers can resolve reports');
  const body = parse(z.object({ action: z.enum(['dismiss', 'remove']), reason: z.string().trim().max(200).optional() }), req.body);
  const r = db().get<{ id: string; post_id: string; comment_id: string | null; status: string }>('SELECT * FROM club_reports WHERE id = ? AND club_id = ?', req.params.reportId as string, club.id);
  if (!r) throw notFound('Report not found');
  if (r.status !== 'open') throw conflict(`Report already ${r.status}`);
  const at = nowIso();
  db().tx(() => {
    if (body.action === 'remove') {
      if (r.comment_id) {
        db().update('club_comments', r.comment_id, { removed_at: at, removed_by: u.id });
        db().run("UPDATE club_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE comment_id = ? AND status = 'open'", at, u.id, r.comment_id);
      } else {
        const p = db().get<PostRow>('SELECT * FROM club_posts WHERE id = ?', r.post_id)!;
        db().update('club_posts', p.id, { removed_at: at, removed_by: u.id, removed_reason: body.reason ?? 'reported' });
        db().run("UPDATE club_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE post_id = ? AND status = 'open'", at, u.id, p.id);
        notify(p.author_id, { module: 'campus', kind: 'club_moderation', title: `Your post in ${club.name_en} was removed`, body: body.reason ? `Reason: ${body.reason}` : 'It was reported and a club moderator removed it under the community guidelines.', link: `/campus/clubs/${club.id}` });
      }
    } else {
      db().update('club_reports', r.id, { status: 'dismissed', resolved_at: at, resolved_by: u.id });
      if (!r.comment_id && db().count('club_reports', "post_id = ? AND comment_id IS NULL AND status = 'open'", r.post_id) === 0) db().update('club_posts', r.post_id, { hidden: 0 });
    }
    audit(u.id, `club.report.${body.action}`, 'club_report', r.id, {});
  });
  ok(res, { id: r.id, status: body.action === 'remove' ? 'removed' : 'dismissed' });
}));

// ------------------------------------------------------------------ follow, roles
communityRouter.post('/clubs/:id/follow', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  db().run('INSERT OR IGNORE INTO club_follows (club_id, user_id, created_at) VALUES (?, ?, ?)', club.id, u.id, nowIso());
  ok(res, { following: true, follower_count: db().count('club_follows', 'club_id = ?', club.id) });
}));

communityRouter.delete('/clubs/:id/follow', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  db().run('DELETE FROM club_follows WHERE club_id = ? AND user_id = ?', club.id, u.id);
  ok(res, { following: false, follower_count: db().count('club_follows', 'club_id = ?', club.id) });
}));

communityRouter.patch('/clubs/:id/members/:membershipId', h((req, res) => {
  const u = requireUser(req);
  const club = getClub(req.params.id as string);
  if (!isLeadOf(u, club)) throw forbidden('Only the club lead can change roles');
  const body = parse(z.object({ role: z.enum(['officer', 'member']), title_en: z.string().trim().max(60).optional(), title_ar: z.string().trim().max(60).optional() }), req.body);
  const m = db().get<MembershipRow>("SELECT * FROM memberships WHERE id = ? AND club_id = ? AND status = 'active'", req.params.membershipId as string, club.id);
  if (!m) throw notFound('Active member not found');
  if (m.role === 'lead') throw conflict('The lead role changes through Student Affairs');
  db().tx(() => {
    db().update('memberships', m.id, { role: body.role });
    if (body.role === 'officer') {
      db().run('INSERT INTO club_member_titles (membership_id, title_en, title_ar, show_in_roster) VALUES (?, ?, ?, 1) ON CONFLICT(membership_id) DO UPDATE SET title_en = excluded.title_en, title_ar = excluded.title_ar', m.id, body.title_en || 'Officer', body.title_ar || 'عضو الهيئة الإدارية');
      notify(m.user_id, { module: 'campus', kind: 'club_role', title: `You are now ${body.title_en || 'an officer'} of ${club.name_en}`, body: 'You can post announcements, pin posts and review reports.', link: `/campus/clubs/${club.id}` });
    } else {
      db().run('DELETE FROM club_member_titles WHERE membership_id = ?', m.id);
    }
    audit(u.id, 'club.member.role', 'membership', m.id, { role: body.role });
  });
  ok(res, { id: m.id, role: body.role });
}));

// ------------------------------------------------------------------ community feed
communityRouter.get('/community/feed', h((req, res) => {
  const u = requireUser(req);
  const memberOf = db().all<{ club_id: string }>("SELECT club_id FROM memberships WHERE user_id = ? AND status = 'active'", u.id).map((r) => r.club_id);
  const follows = db().all<{ club_id: string }>('SELECT club_id FROM club_follows WHERE user_id = ?', u.id).map((r) => r.club_id).filter((id) => !memberOf.includes(id));
  const ids = [...memberOf, ...follows];
  if (!ids.length) return ok(res, { items: [], clubs: 0 });
  const rows = db().all<PostRow>(`SELECT * FROM club_posts WHERE removed_at IS NULL AND club_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC, rowid DESC LIMIT 60`, ...ids);
  const clubs = new Map<string, ClubRow>();
  const items = rows.flatMap((p) => {
    const club = clubs.get(p.club_id) ?? getClub(p.club_id);
    clubs.set(club.id, club);
    if (!canSee(u, club, p)) return [];
    return [{ ...postView(p, club, u), club: { id: club.id, name_en: club.name_en, name_ar: club.name_ar, color: club.color } }];
  }).slice(0, 20);
  ok(res, { items, clubs: ids.length });
}));

// ------------------------------------------------------------------ QR self check-in
/** Check-in opens 30 minutes before the start and closes an hour after the end. */
function checkinWindow(e: { start_at: string; end_at: string }) {
  const opens = new Date(new Date(e.start_at).getTime() - 30 * 60e3);
  const closes = new Date(new Date(e.end_at).getTime() + 60 * 60e3);
  const t = now();
  return { opens_at: opens.toISOString(), closes_at: closes.toISOString(), open: t >= opens && t <= closes };
}

/** The code printed on the venue's QR poster. Deterministic per event so a printed poster keeps working. */
export function checkinCode(eventId: string) {
  return stableHash({ checkin: eventId }).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
}

export function checkinState(eventId: string, u: User) {
  const e = getEvent(eventId);
  const club = e.club_id ? getClub(e.club_id) : null;
  const staff = hasRole(u, 'reviewer') || (club ? canModerate(u, club) : false);
  const mine = db().get<{ created_at: string; method: string }>('SELECT created_at, method FROM event_checkins WHERE event_id = ? AND user_id = ?', e.id, u.id);
  const w = checkinWindow(e);
  return {
    ...w,
    checked_in: mine ? { at: mine.created_at, method: mine.method } : null,
    count: db().count('event_checkins', 'event_id = ?', e.id),
    // Organisers see the poster code; in demo mode everyone does, standing in for scanning the poster at the venue.
    code: staff || config.demoMode ? checkinCode(e.id) : null,
    qr_payload: staff || config.demoMode ? `uj:checkin:${e.id}:${checkinCode(e.id)}` : null,
    is_organiser: staff
  };
}

communityRouter.get('/events/:id/checkin', h((req, res) => {
  const u = requireUser(req);
  ok(res, checkinState(req.params.id as string, u));
}));

communityRouter.post('/events/:id/checkin', h((req, res) => {
  const u = requireUser(req);
  if (!hasRole(u, 'student', 'club_lead')) throw forbidden('Only students check in to events');
  const e = getEvent(req.params.id as string);
  const body = parse(z.object({ code: z.string().trim().min(4).max(64) }), req.body);
  const code = body.code.toUpperCase().split(':').pop()!;
  if (code !== checkinCode(e.id)) throw unprocessable('That code does not match this event. Scan the poster at the venue again.');
  const w = checkinWindow(e);
  if (!w.open) throw conflict(new Date(w.opens_at) > now() ? 'Check-in opens 30 minutes before the event starts.' : 'Check-in for this event has closed.', w);
  const existing = db().get('SELECT created_at FROM event_checkins WHERE event_id = ? AND user_id = ?', e.id, u.id);
  if (existing) return ok(res, { ...checkinState(e.id, u), created: false });
  const club = e.club_id ? getClub(e.club_id) : null;
  db().tx(() => {
    db().insert('event_checkins', { event_id: e.id, user_id: u.id, method: 'qr_self', created_at: nowIso() });
    if (!db().get('SELECT 1 FROM achievements WHERE user_id = ? AND event_id = ?', u.id, e.id)) {
      db().insert('achievements', {
        id: newId('ach'), user_id: u.id, title_en: `Attended ${e.title_en}`, title_ar: e.title_ar ? `حضور ${e.title_ar}` : '', kind: 'participation',
        event_id: e.id, club_id: e.club_id, verified_by: club?.lead_id ?? null, evidence_document_id: null, created_at: nowIso()
      });
    }
    audit(u.id, 'event.checkin', 'event', e.id, { method: 'qr_self' });
  });
  ok(res, { ...checkinState(e.id, u), created: true }, 201);
}));

