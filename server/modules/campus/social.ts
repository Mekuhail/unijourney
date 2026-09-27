import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import { db, j, pj } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, conflict, unprocessable, HttpError } from '../../core/http.ts';
import { hasRole, requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { now, nowIso } from '../../core/clock.ts';
import { notify } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { checkText } from '../../core/moderation.ts';
import { getDocument, registerDocumentGrant } from '../../core/documents.ts';
import { isSyntheticMember } from '../../seed/members.ts';
import { getClub, nowLocalIso, type ClubRow } from './shared.ts';
import { postView as clubPostView, tagView, CLUB_TAGS } from './community.ts';

/**
 * Campus community: student profiles, university-wide student posts (text, optional image, linked event, optional
 * club tag), likes, comments, reports, discovery search and a combined home feed that also carries the club posts
 * each student may see. Club posts keep their own rules in community.ts; this module only reads them.
 *
 * Every permission is enforced here: students write, everyone signed in reads what their audience allows, authors
 * edit their own posts, the academic reviewer moderates. Profiles never expose student numbers or email.
 */
export const socialRouter = Router();

const isStudent = (u: User) => hasRole(u, 'student', 'club_lead');
const isModerator = (u: User) => hasRole(u, 'reviewer');

function requireStudent(u: User) {
  if (!isStudent(u)) throw forbidden('Only students can post in the community');
}

function rateLimited(message: string) {
  return new HttpError(429, 'rate_limited', message);
}

function assertClean(text: string) {
  const c = checkText(text);
  if (c.blocking) throw unprocessable(c.flags.includes('abusive') ? 'Please rephrase: the text contains language that breaks the community guidelines.' : 'Please remove phone numbers, email addresses or student numbers before posting publicly.', { flags: c.flags });
  return c;
}

// ------------------------------------------------------------------ profiles
interface ProfileRow { user_id: string; display_name: string | null; bio: string; avatar_color: string | null; show_program: number; show_campus: number; show_clubs: number; dm_policy: string; updated_at: string }
interface UserRow { id: string; roles: string; name_en: string; name_ar: string; program_id: string | null; campus_id: string; stage: string; level: number; interests: string; avatar_color: string }

export function profileOf(userId: string): ProfileRow {
  return db().get<ProfileRow>('SELECT * FROM community_profiles WHERE user_id = ?', userId)
    ?? { user_id: userId, display_name: null, bio: '', avatar_color: null, show_program: 1, show_campus: 1, show_clubs: 1, dm_policy: 'everyone', updated_at: '' };
}

function userRow(id: string) {
  return db().get<UserRow>('SELECT id, roles, name_en, name_ar, program_id, campus_id, stage, level, interests, avatar_color FROM users WHERE id = ?', id) ?? null;
}

const isStudentRow = (u: UserRow) => pj<string[]>(u.roles, []).some((r) => r === 'student' || r === 'club_lead') && u.stage !== 'applicant';

/** The public face of a person: display name, colour, and only the fields they chose to show. Never email or student number. */
export function personBrief(id: string) {
  const u = userRow(id);
  if (!u) return null;
  const p = profileOf(id);
  return {
    id: u.id,
    name_en: p.display_name || u.name_en,
    name_ar: p.display_name || u.name_ar,
    avatar_color: p.avatar_color || u.avatar_color,
    program_id: p.show_program ? u.program_id : null,
    campus_id: p.show_campus ? u.campus_id : null
  };
}

function programName(id: string | null) {
  if (!id) return null;
  const p = db().get<{ code: string; name_en: string; name_ar: string }>('SELECT code, name_en, name_ar FROM programs WHERE id = ?', id);
  return p ? { id, code: p.code, name_en: p.name_en, name_ar: p.name_ar } : { id, code: id.toUpperCase(), name_en: id.toUpperCase(), name_ar: id.toUpperCase() };
}

export function isBlocked(a: string, b: string) {
  return !!db().get('SELECT 1 FROM dm_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a);
}

function sharesClub(a: string, b: string) {
  return !!db().get("SELECT 1 FROM memberships x JOIN memberships y ON y.club_id = x.club_id WHERE x.user_id = ? AND y.user_id = ? AND x.status = 'active' AND y.status = 'active'", a, b);
}

/** Whether `me` may open a new conversation with `other`, and if not, why (shown on the profile). */
export function messagePermission(me: User, otherId: string): { allowed: boolean; reason: string | null } {
  if (me.id === otherId) return { allowed: false, reason: 'self' };
  if (!isStudent(me)) return { allowed: false, reason: 'not_student' };
  const other = userRow(otherId);
  if (!other || !isStudentRow(other)) return { allowed: false, reason: 'not_student' };
  if (db().get('SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', me.id, otherId)) return { allowed: false, reason: 'you_blocked' };
  if (db().get('SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', otherId, me.id)) return { allowed: false, reason: 'unavailable' };
  const policy = profileOf(otherId).dm_policy;
  if (policy === 'nobody') return { allowed: false, reason: 'closed' };
  if (policy === 'club_mates' && !sharesClub(me.id, otherId)) return { allowed: false, reason: 'club_mates' };
  return { allowed: true, reason: null };
}

function clubsOf(userId: string) {
  return db().all(`SELECT c.id, c.name_en, c.name_ar, c.color, c.category, m.role, t.title_en, t.title_ar
    FROM memberships m JOIN clubs c ON c.id = m.club_id LEFT JOIN club_member_titles t ON t.membership_id = m.id
    WHERE m.user_id = ? AND m.status = 'active' ORDER BY CASE m.role WHEN 'lead' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, c.name_en`, userId);
}

socialRouter.get('/community/profile/me', h((req, res) => {
  const u = requireUser(req);
  const p = profileOf(u.id);
  ok(res, {
    ...personBrief(u.id), record_name_en: u.name_en, record_name_ar: u.name_ar, display_name: p.display_name, bio: p.bio,
    avatar_color: p.avatar_color || u.avatar_color, interests: u.interests, show_program: !!p.show_program, show_campus: !!p.show_campus, show_clubs: !!p.show_clubs,
    dm_policy: p.dm_policy, program: programName(u.program_id), campus_id: u.campus_id, suggested_interests: Object.keys(CLUB_TAGS).map(tagView)
  });
}));

const COLORS = ['#F0762B', '#C8975B', '#2E9E6B', '#2F6FDB', '#7C5CFF', '#0EA5E9', '#14B8A6', '#E11D48', '#BE185D', '#4F46E5', '#334155', '#7C2D12'];

socialRouter.put('/community/profile/me', h((req, res) => {
  const u = requireUser(req);
  requireStudent(u);
  const body = parse(z.object({
    display_name: z.string().trim().max(40).nullable().optional(),
    bio: z.string().trim().max(280).optional(),
    avatar_color: z.string().refine((c) => COLORS.includes(c), 'Pick one of the offered colours').optional(),
    interests: z.array(z.string().trim().min(2).max(30)).max(8).optional(),
    show_program: z.boolean().optional(), show_campus: z.boolean().optional(), show_clubs: z.boolean().optional(),
    dm_policy: z.enum(['everyone', 'club_mates', 'nobody']).optional()
  }).strict(), req.body);
  if (body.display_name) assertClean(body.display_name);
  if (body.bio) assertClean(body.bio);
  const cur = profileOf(u.id);
  const next = {
    user_id: u.id,
    display_name: body.display_name === undefined ? cur.display_name : (body.display_name || null),
    bio: body.bio ?? cur.bio,
    avatar_color: body.avatar_color ?? cur.avatar_color,
    show_program: body.show_program === undefined ? cur.show_program : body.show_program ? 1 : 0,
    show_campus: body.show_campus === undefined ? cur.show_campus : body.show_campus ? 1 : 0,
    show_clubs: body.show_clubs === undefined ? cur.show_clubs : body.show_clubs ? 1 : 0,
    dm_policy: body.dm_policy ?? cur.dm_policy,
    updated_at: nowIso()
  };
  db().tx(() => {
    db().upsert('community_profiles', next);
    if (body.interests) db().update('users', u.id, { interests: j([...new Set(body.interests.map((i) => i.toLowerCase()))]) });
    audit(u.id, 'community.profile.update', 'user', u.id, { fields: Object.keys(body) });
  });
  ok(res, { ...personBrief(u.id), display_name: next.display_name, bio: next.bio, dm_policy: next.dm_policy });
}));

socialRouter.get('/community/people', h((req, res) => {
  const viewer = requireUser(req);
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const interest = String(req.query.interest ?? '').trim().toLowerCase();
  const rows = db().all<UserRow>("SELECT id, roles, name_en, name_ar, program_id, campus_id, stage, level, interests, avatar_color FROM users WHERE stage IN ('current','graduating') ORDER BY name_en").filter(isStudentRow);
  const items = rows.filter((u) => !isBlocked(viewer.id, u.id) || isModerator(viewer)).map((u) => {
    const p = profileOf(u.id);
    const brief = personBrief(u.id)!;
    const interests = pj<string[]>(u.interests, []);
    return { ...brief, bio: p.bio, interests: interests.map(tagView), clubs: p.show_clubs ? clubsOf(u.id).length : null, is_me: u.id === viewer.id, shared_clubs: sharesClub(viewer.id, u.id) };
  }).filter((p) => (!q || [p.name_en, p.name_ar, p.bio, ...p.interests.flatMap((i) => [i.en, i.ar])].some((s) => s.toLowerCase().includes(q))) && (!interest || p.interests.some((i) => i.key === interest)));
  // People who share a club first, then the viewer's own campus.
  items.sort((a, b) => Number(b.shared_clubs) - Number(a.shared_clubs) || Number(b.campus_id === viewer.campus_id) - Number(a.campus_id === viewer.campus_id) || a.name_en.localeCompare(b.name_en));
  ok(res, { items: items.slice(0, 80), total: items.length });
}));

socialRouter.get('/community/people/:id', h((req, res) => {
  const viewer = requireUser(req);
  const u = userRow(req.params.id as string);
  if (!u || !isStudentRow(u)) throw notFound('Profile not found');
  const me = u.id === viewer.id;
  if (!me && !isModerator(viewer) && db().get('SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', u.id, viewer.id)) throw notFound('Profile not found');
  const p = profileOf(u.id);
  const posts = db().all<SocialRow>('SELECT * FROM social_posts WHERE author_id = ? AND removed_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 20', u.id).filter((x) => canSeeSocial(x, viewer)).slice(0, 10).map((x) => socialView(x, viewer));
  const clubPosts = db().all<ClubPostRow>('SELECT * FROM club_posts WHERE author_id = ? AND removed_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 30', u.id)
    .flatMap((x) => { const c = getClub(x.club_id); return canSeeClubPost(x, c, viewer) ? [clubFeedView(x, c, viewer)] : []; }).slice(0, 10);
  const perm = messagePermission(viewer, u.id);
  ok(res, {
    ...personBrief(u.id),
    bio: p.bio,
    interests: pj<string[]>(u.interests, []).map(tagView),
    program: p.show_program || me ? programName(u.program_id) : null,
    campus_id: p.show_campus || me ? u.campus_id : null,
    level: p.show_program || me ? u.level : null,
    clubs: p.show_clubs || me ? clubsOf(u.id) : null,
    posts: [...posts, ...clubPosts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 12),
    post_count: db().count('social_posts', 'author_id = ? AND removed_at IS NULL', u.id),
    is_me: me,
    can_message: perm.allowed,
    message_reason: perm.reason,
    blocked_by_me: !!db().get('SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', viewer.id, u.id),
    conversation_id: (db().get<{ id: string }>('SELECT id FROM dm_conversations WHERE user_a = ? AND user_b = ?', ...[viewer.id, u.id].sort())?.id) ?? null,
    synthetic: isSyntheticMember(u.id)
  });
}));

// ------------------------------------------------------------------ student posts
export interface SocialRow { id: string; author_id: string; body: string; media_document_id: string | null; media_alt: string | null; event_id: string | null; club_id: string | null; audience: string; campus_id: string; hidden: number; created_at: string; edited_at: string | null; removed_at: string | null }
interface ClubPostRow { id: string; club_id: string; author_id: string; kind: string; body: string; hidden: number; created_at: string; removed_at: string | null; [k: string]: unknown }

export function canSeeSocial(p: SocialRow, viewer: User) {
  if (p.removed_at) return false;
  if (isModerator(viewer)) return true;
  if (p.author_id === viewer.id) return true;
  if (p.hidden) return false;
  if (p.audience === 'campus' && p.campus_id !== viewer.campus_id) return false;
  return !isBlocked(viewer.id, p.author_id);
}

function eventBrief(id: string | null) {
  if (!id) return null;
  return db().get('SELECT id, title_en, title_ar, start_at, end_at, club_id FROM events WHERE id = ?', id) ?? null;
}

function clubBrief(id: string | null) {
  if (!id) return null;
  return db().get('SELECT id, name_en, name_ar, color FROM clubs WHERE id = ?', id) ?? null;
}

/** Same shape as a club post (community.ts postView) so one card renders both, plus type, media and audience. */
export function socialView(p: SocialRow, viewer: User) {
  const own = p.author_id === viewer.id;
  const student = isStudent(viewer);
  const author = personBrief(p.author_id);
  const comments = db().all<{ id: string; author_id: string; body: string; created_at: string }>('SELECT id, author_id, body, created_at FROM social_comments WHERE post_id = ? AND removed_at IS NULL ORDER BY created_at, rowid', p.id)
    .filter((c) => c.author_id === viewer.id || isModerator(viewer) || !isBlocked(viewer.id, c.author_id))
    .map((c) => ({ ...c, author: personBrief(c.author_id) ? { ...personBrief(c.author_id)!, role: null, title_en: null, title_ar: null } : null, is_answer: false, can_delete: c.author_id === viewer.id || own || isModerator(viewer) }));
  const media = p.media_document_id ? getDocument(p.media_document_id) : null;
  return {
    type: 'social' as const,
    id: p.id, club_id: p.club_id, kind: 'social', body: p.body, created_at: p.created_at, edited_at: p.edited_at,
    pinned: false, pinned_until: null, hidden: !!p.hidden, audience: p.audience, campus_id: p.campus_id,
    author: author ? { ...author, role: null, title_en: null, title_ar: null } : null,
    event: eventBrief(p.event_id),
    club: clubBrief(p.club_id),
    media: media ? { id: media.id, url: `/api/documents/${media.id}/file`, alt: p.media_alt ?? '', mime: media.mime } : null,
    reactions: db().count('social_likes', 'post_id = ?', p.id),
    reacted: !!db().get('SELECT 1 FROM social_likes WHERE post_id = ? AND user_id = ?', p.id, viewer.id),
    comments,
    answer_comment_id: null,
    poll: null,
    can: { edit: own, delete: own || isModerator(viewer), pin: false, comment: student, react: student, vote: false, accept: false, report: !own }
  };
}

function canSeeClubPost(p: ClubPostRow, club: ClubRow, viewer: User) {
  if (p.removed_at) return false;
  if (p.hidden && p.author_id !== viewer.id) return false;
  if (isBlocked(viewer.id, p.author_id)) return false;
  if (p.kind === 'announcement') return true;
  return !!db().get("SELECT 1 FROM memberships WHERE club_id = ? AND user_id = ? AND status = 'active'", club.id, viewer.id) || club.lead_id === viewer.id;
}

function clubFeedView(p: ClubPostRow, club: ClubRow, viewer: User) {
  return { type: 'club' as const, ...clubPostView(p as never, club, viewer), club: { id: club.id, name_en: club.name_en, name_ar: club.name_ar, color: club.color }, media: null, audience: 'club' };
}

function getSocial(id: string, viewer: User): SocialRow {
  const p = db().get<SocialRow>('SELECT * FROM social_posts WHERE id = ?', id);
  if (!p || !canSeeSocial(p, viewer)) throw notFound('Post not found');
  return p;
}

// Media: images attached to a post are readable by anyone who can see the post.
registerDocumentGrant((doc, user) => {
  if (doc.kind !== 'post_media') return false;
  const p = db().get<SocialRow>('SELECT * FROM social_posts WHERE media_document_id = ?', doc.id);
  return !!p && canSeeSocial(p, user);
});

/** The combined home feed: student posts plus club posts from clubs you joined or follow. */
socialRouter.get('/community/home', h((req, res) => {
  const viewer = requireUser(req);
  const q = parse(z.object({ scope: z.enum(['all', 'students', 'clubs']).optional(), campus: z.enum(['all', 'mine']).optional(), q: z.string().max(80).optional() }), req.query);
  const scope = q.scope ?? 'all';
  const text = (q.q ?? '').trim().toLowerCase();
  const items: Array<ReturnType<typeof socialView> | ReturnType<typeof clubFeedView>> = [];
  if (scope !== 'clubs') {
    const rows = db().all<SocialRow>('SELECT * FROM social_posts WHERE removed_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 200');
    for (const p of rows) {
      if (!canSeeSocial(p, viewer)) continue;
      if (q.campus === 'mine' && p.campus_id !== viewer.campus_id) continue;
      if (text && !p.body.toLowerCase().includes(text)) continue;
      items.push(socialView(p, viewer));
    }
  }
  if (scope !== 'students') {
    const joined = db().all<{ club_id: string }>("SELECT club_id FROM memberships WHERE user_id = ? AND status = 'active'", viewer.id).map((r) => r.club_id);
    const followed = db().all<{ club_id: string }>('SELECT club_id FROM club_follows WHERE user_id = ?', viewer.id).map((r) => r.club_id);
    const ids = [...new Set([...joined, ...followed])];
    if (ids.length) {
      const rows = db().all<ClubPostRow>(`SELECT * FROM club_posts WHERE removed_at IS NULL AND club_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC, rowid DESC LIMIT 120`, ...ids);
      const clubs = new Map<string, ClubRow>();
      for (const p of rows) {
        const club = clubs.get(p.club_id) ?? getClub(p.club_id);
        clubs.set(club.id, club);
        if (!canSeeClubPost(p, club, viewer)) continue;
        if (!joined.includes(club.id) && p.kind !== 'announcement') continue;
        if (q.campus === 'mine' && club.campus_id !== viewer.campus_id) continue;
        if (text && !p.body.toLowerCase().includes(text)) continue;
        items.push(clubFeedView(p, club, viewer));
      }
    }
  }
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  ok(res, { items: items.slice(0, 40), total: items.length, can_post: isStudent(viewer) });
}));

socialRouter.get('/community/posts/:id', h((req, res) => {
  const viewer = requireUser(req);
  ok(res, socialView(getSocial(req.params.id as string, viewer), viewer));
}));

const postBody = z.object({
  body: z.string().trim().min(2).max(1500),
  media_document_id: z.string().nullable().optional(),
  media_alt: z.string().trim().max(200).optional(),
  event_id: z.string().nullable().optional(),
  club_id: z.string().nullable().optional(),
  audience: z.enum(['all', 'campus']).optional()
});

function validateAttachments(u: User, b: { media_document_id?: string | null; event_id?: string | null; club_id?: string | null }) {
  if (b.media_document_id) {
    const d = getDocument(b.media_document_id);
    if (!d || d.owner_id !== u.id || d.kind !== 'post_media' || !d.mime.startsWith('image/')) throw unprocessable('Attach a PNG or JPEG image you uploaded');
    if (db().get('SELECT 1 FROM social_posts WHERE media_document_id = ? AND removed_at IS NULL', d.id)) throw conflict('That image is already attached to another post');
  }
  if (b.event_id) {
    const e = db().get<{ kind: string; owner_id: string | null }>('SELECT kind, owner_id FROM events WHERE id = ?', b.event_id);
    if (!e || (e.kind === 'personal' && e.owner_id !== u.id)) throw unprocessable('Link a campus event');
    if (e.kind === 'personal') throw unprocessable('Personal events cannot be shared');
  }
  if (b.club_id && !db().get("SELECT 1 FROM memberships WHERE club_id = ? AND user_id = ? AND status = 'active'", b.club_id, u.id)) throw unprocessable('Tag a club you belong to');
}

socialRouter.post('/community/posts', h((req, res) => {
  const u = requireUser(req);
  requireStudent(u);
  const b = parse(postBody, req.body);
  validateAttachments(u, b);
  const hourAgo = new Date(now().getTime() - 3600e3).toISOString();
  if (db().count('social_posts', 'author_id = ? AND created_at >= ?', u.id, hourAgo) >= 6) throw rateLimited('Slow mode: you can post again in a little while.');
  const c = assertClean(`${b.body}\n${b.media_alt ?? ''}`);
  const id = newId('sp');
  db().tx(() => {
    db().insert('social_posts', {
      id, author_id: u.id, body: b.body, media_document_id: b.media_document_id ?? null, media_alt: b.media_alt ?? null, event_id: b.event_id ?? null, club_id: b.club_id ?? null,
      audience: b.audience ?? 'all', campus_id: u.campus_id, hidden: c.flags.includes('links') ? 1 : 0, created_at: nowIso(), edited_at: null, removed_at: null, removed_by: null, removed_reason: null
    });
    audit(u.id, 'community.post.create', 'social_post', id, { audience: b.audience ?? 'all' });
  });
  ok(res, socialView(getSocial(id, u), u), 201);
}));

socialRouter.patch('/community/posts/:id', h((req, res) => {
  const u = requireUser(req);
  const p = getSocial(req.params.id as string, u);
  if (p.author_id !== u.id) throw forbidden('Only the author can edit a post');
  const b = parse(z.object({ body: z.string().trim().min(2).max(1500).optional(), media_alt: z.string().trim().max(200).optional(), remove_media: z.boolean().optional(), audience: z.enum(['all', 'campus']).optional() }), req.body);
  if (b.body !== undefined) assertClean(b.body);
  db().update('social_posts', p.id, {
    ...(b.body !== undefined ? { body: b.body } : {}),
    ...(b.media_alt !== undefined ? { media_alt: b.media_alt } : {}),
    ...(b.remove_media ? { media_document_id: null, media_alt: null } : {}),
    ...(b.audience ? { audience: b.audience } : {}),
    edited_at: nowIso()
  });
  ok(res, socialView(getSocial(p.id, u), u));
}));

socialRouter.delete('/community/posts/:id', h((req, res) => {
  const u = requireUser(req);
  const p = getSocial(req.params.id as string, u);
  const own = p.author_id === u.id;
  if (!own && !isModerator(u)) throw forbidden('Only the author or a community moderator can remove a post');
  const reason = typeof req.query.reason === 'string' ? req.query.reason.slice(0, 200) : null;
  db().tx(() => {
    db().update('social_posts', p.id, { removed_at: nowIso(), removed_by: u.id, removed_reason: own ? 'author' : (reason ?? 'moderator') });
    db().run("UPDATE community_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE target_type = 'social_post' AND target_id = ? AND status = 'open'", nowIso(), u.id, p.id);
    if (!own) notify(p.author_id, { module: 'community', kind: 'community_moderation', title: 'Your community post was removed', body: reason ? `Reason: ${reason}` : 'A moderator removed it under the community guidelines.', link: '/campus/community' });
    audit(u.id, own ? 'community.post.delete' : 'community.post.remove', 'social_post', p.id, { reason });
  });
  ok(res, { id: p.id, removed: true });
}));

socialRouter.post('/community/posts/:id/react', h((req, res) => {
  const u = requireUser(req);
  requireStudent(u);
  const p = getSocial(req.params.id as string, u);
  const existing = db().get('SELECT 1 FROM social_likes WHERE post_id = ? AND user_id = ?', p.id, u.id);
  if (existing) db().run('DELETE FROM social_likes WHERE post_id = ? AND user_id = ?', p.id, u.id);
  else db().insert('social_likes', { post_id: p.id, user_id: u.id, created_at: nowIso() });
  ok(res, { reacted: !existing, count: db().count('social_likes', 'post_id = ?', p.id) });
}));

socialRouter.post('/community/posts/:id/comments', h((req, res) => {
  const u = requireUser(req);
  requireStudent(u);
  const p = getSocial(req.params.id as string, u);
  const b = parse(z.object({ body: z.string().trim().min(1).max(600) }), req.body);
  assertClean(b.body);
  const minuteAgo = new Date(now().getTime() - 60e3).toISOString();
  if (db().count('social_comments', 'author_id = ? AND created_at >= ?', u.id, minuteAgo) >= 10) throw rateLimited('Slow mode: wait a moment before replying again.');
  const id = newId('sc');
  db().tx(() => {
    db().insert('social_comments', { id, post_id: p.id, author_id: u.id, body: b.body, created_at: nowIso(), removed_at: null, removed_by: null });
    if (p.author_id !== u.id && !isBlocked(p.author_id, u.id)) {
      const who = personBrief(u.id)!;
      notify(p.author_id, { module: 'community', kind: 'community_reply', title: `${who.name_en} replied to your post`, body: b.body.slice(0, 140), link: `/campus/community/posts/${p.id}` });
    }
  });
  ok(res, socialView(getSocial(p.id, u), u), 201);
}));

socialRouter.delete('/community/posts/:id/comments/:commentId', h((req, res) => {
  const u = requireUser(req);
  const p = getSocial(req.params.id as string, u);
  const c = db().get<{ id: string; author_id: string }>('SELECT id, author_id FROM social_comments WHERE id = ? AND post_id = ? AND removed_at IS NULL', req.params.commentId as string, p.id);
  if (!c) throw notFound('Reply not found');
  if (c.author_id !== u.id && p.author_id !== u.id && !isModerator(u)) throw forbidden('Only the author of the reply or of the post can remove it');
  db().update('social_comments', c.id, { removed_at: nowIso(), removed_by: u.id });
  ok(res, socialView(getSocial(p.id, u), u));
}));

// ------------------------------------------------------------------ reports (posts, replies, messages)
const HIDE_AT = 3;
export const REPORT_REASONS = ['spam', 'harassment', 'off_topic', 'personal_info', 'other'] as const;

export function fileReport(u: User, target_type: 'social_post' | 'social_comment' | 'message', target_id: string, reason: string, note?: string) {
  const dupe = db().get<{ id: string }>('SELECT id FROM community_reports WHERE target_type = ? AND target_id = ? AND reporter_id = ?', target_type, target_id, u.id);
  if (dupe) return { id: dupe.id, created: false };
  const id = newId('crep');
  db().tx(() => {
    db().insert('community_reports', { id, target_type, target_id, reporter_id: u.id, reason, note: note ?? null, status: 'open', created_at: nowIso(), resolved_at: null, resolved_by: null });
    if (target_type === 'social_post' && db().count('community_reports', "target_type = 'social_post' AND target_id = ? AND status = 'open'", target_id) >= HIDE_AT) db().update('social_posts', target_id, { hidden: 1 });
    for (const m of db().all<{ id: string }>("SELECT id FROM users WHERE roles LIKE '%reviewer%'")) notify(m.id, { module: 'community', kind: 'community_report', title: 'New community report', body: `Reason: ${reason.replace('_', ' ')}`, link: '/staff/campus/community' });
    audit(u.id, 'community.report', target_type, target_id, { reason });
  });
  return { id, created: true };
}

socialRouter.post('/community/posts/:id/report', h((req, res) => {
  const u = requireUser(req);
  const b = parse(z.object({ reason: z.enum(REPORT_REASONS), note: z.string().trim().max(300).optional(), comment_id: z.string().optional() }), req.body);
  const p = db().get<SocialRow>('SELECT * FROM social_posts WHERE id = ?', req.params.id as string);
  if (!p || p.removed_at) throw notFound('Post not found');
  const already = db().get('SELECT 1 FROM community_reports WHERE target_type = ? AND target_id = ? AND reporter_id = ?', b.comment_id ? 'social_comment' : 'social_post', b.comment_id ?? p.id, u.id);
  if (!already && !canSeeSocial(p, u)) throw notFound('Post not found');
  if (b.comment_id) {
    const c = db().get<{ author_id: string }>('SELECT author_id FROM social_comments WHERE id = ? AND post_id = ? AND removed_at IS NULL', b.comment_id, p.id);
    if (!c) throw notFound('Reply not found');
    if (c.author_id === u.id) throw conflict('You cannot report your own reply');
  } else if (p.author_id === u.id) throw conflict('You cannot report your own post');
  const r = fileReport(u, b.comment_id ? 'social_comment' : 'social_post', b.comment_id ?? p.id, b.reason, b.note);
  ok(res, r, r.created ? 201 : 200);
}));

/** Moderator queue: the reported text only (for messages, just the one reported message, never the thread). */
socialRouter.get('/community/reports', h((req, res) => {
  const u = requireUser(req);
  if (!isModerator(u)) throw forbidden('Only community moderators can see reports');
  const rows = db().all<{ id: string; target_type: string; target_id: string; reason: string; note: string | null; created_at: string }>("SELECT id, target_type, target_id, reason, note, created_at FROM community_reports WHERE status = 'open' ORDER BY created_at DESC, rowid DESC");
  ok(res, rows.map((r) => {
    const t = r.target_type === 'social_post' ? db().get<{ body: string; author_id: string; hidden?: number }>('SELECT body, author_id, hidden FROM social_posts WHERE id = ?', r.target_id)
      : r.target_type === 'social_comment' ? db().get<{ body: string; author_id: string; post_id: string }>('SELECT body, author_id, post_id FROM social_comments WHERE id = ?', r.target_id)
      : db().get<{ body: string; sender_id: string }>('SELECT body, sender_id AS author_id FROM dm_messages WHERE id = ?', r.target_id);
    const reports = db().count('community_reports', "target_type = ? AND target_id = ? AND status = 'open'", r.target_type, r.target_id);
    return { ...r, body: (t as { body?: string } | undefined)?.body ?? '', author: t ? personBrief((t as { author_id: string }).author_id) : null, hidden: !!(t as { hidden?: number } | undefined)?.hidden, reports, link: r.target_type === 'social_post' ? `/campus/community/posts/${r.target_id}` : r.target_type === 'social_comment' ? `/campus/community/posts/${(t as { post_id?: string } | undefined)?.post_id ?? ''}` : null };
  }));
}));

socialRouter.post('/community/reports/:id/resolve', h((req, res) => {
  const u = requireUser(req);
  if (!isModerator(u)) throw forbidden('Only community moderators can resolve reports');
  const b = parse(z.object({ action: z.enum(['dismiss', 'remove']), reason: z.string().trim().max(200).optional() }), req.body);
  const r = db().get<{ id: string; target_type: string; target_id: string; status: string }>('SELECT * FROM community_reports WHERE id = ?', req.params.id as string);
  if (!r) throw notFound('Report not found');
  if (r.status !== 'open') throw conflict(`Report already ${r.status}`);
  const at = nowIso();
  db().tx(() => {
    if (b.action === 'remove') {
      const table = r.target_type === 'social_post' ? 'social_posts' : r.target_type === 'social_comment' ? 'social_comments' : 'dm_messages';
      const row = db().get<{ author_id?: string; sender_id?: string }>(`SELECT * FROM ${table} WHERE id = ?`, r.target_id);
      db().update(table, r.target_id, table === 'social_posts' ? { removed_at: at, removed_by: u.id, removed_reason: b.reason ?? 'reported' } : table === 'social_comments' ? { removed_at: at, removed_by: u.id } : { removed_at: at });
      const author = row?.author_id ?? row?.sender_id;
      if (author) notify(author, { module: 'community', kind: 'community_moderation', title: 'Content you shared was removed', body: b.reason ? `Reason: ${b.reason}` : 'A moderator removed it under the community guidelines.', link: '/campus/community' });
      db().run("UPDATE community_reports SET status = 'removed', resolved_at = ?, resolved_by = ? WHERE target_type = ? AND target_id = ? AND status = 'open'", at, u.id, r.target_type, r.target_id);
    } else {
      db().run("UPDATE community_reports SET status = 'dismissed', resolved_at = ?, resolved_by = ? WHERE target_type = ? AND target_id = ? AND status = 'open'", at, u.id, r.target_type, r.target_id);
      if (r.target_type === 'social_post') db().update('social_posts', r.target_id, { hidden: 0 });
    }
    audit(u.id, `community.report.${b.action}`, 'community_report', r.id, {});
  });
  ok(res, { id: r.id, status: b.action === 'remove' ? 'removed' : 'dismissed' });
}));

// ------------------------------------------------------------------ discovery
socialRouter.get('/community/search', h((req, res) => {
  const viewer = requireUser(req);
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (q.length < 2) return ok(res, { q, posts: [], clubs: [], events: [], people: [] });
  const like = `%${q}%`;
  const posts = db().all<SocialRow>('SELECT * FROM social_posts WHERE removed_at IS NULL AND lower(body) LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 40', like).filter((p) => canSeeSocial(p, viewer)).slice(0, 10).map((p) => socialView(p, viewer));
  const clubPosts = db().all<ClubPostRow>("SELECT * FROM club_posts WHERE removed_at IS NULL AND lower(body) LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 40", like)
    .flatMap((p) => { const c = getClub(p.club_id); return canSeeClubPost(p, c, viewer) ? [clubFeedView(p, c, viewer)] : []; }).slice(0, 10);
  const clubs = db().all<ClubRow>('SELECT * FROM clubs ORDER BY name_en').filter((c) => {
    const tags = pj<string[]>((db().get<{ tags: string }>('SELECT tags FROM club_profiles WHERE club_id = ?', c.id)?.tags) ?? '[]', []);
    return [c.name_en, c.name_ar, c.description_en, ...tags].some((s) => s.toLowerCase().includes(q));
  }).map((c) => ({ id: c.id, name_en: c.name_en, name_ar: c.name_ar, color: c.color, category: c.category, campus_id: c.campus_id, member_count: db().count('memberships', "club_id = ? AND status = 'active'", c.id) }));
  const events = db().all<{ id: string; title_en: string; title_ar: string; start_at: string; end_at: string; club_id: string | null; kind: string }>("SELECT id, title_en, title_ar, start_at, end_at, club_id, kind FROM events WHERE status <> 'cancelled' AND kind IN ('club','university','external') AND end_at >= ? AND (lower(title_en) LIKE ? OR title_ar LIKE ? OR lower(description_en) LIKE ?) ORDER BY start_at LIMIT 10", nowLocalIso(), like, like, like);
  const people = db().all<UserRow>("SELECT id, roles, name_en, name_ar, program_id, campus_id, stage, level, interests, avatar_color FROM users WHERE stage IN ('current','graduating')").filter(isStudentRow)
    .filter((u) => !isBlocked(viewer.id, u.id)).map((u) => ({ ...personBrief(u.id)!, bio: profileOf(u.id).bio, interests: pj<string[]>(u.interests, []) }))
    .filter((p) => [p.name_en, p.name_ar, p.bio, ...p.interests].some((s) => s.toLowerCase().includes(q))).slice(0, 12).map((p) => ({ ...p, interests: p.interests.map(tagView) }));
  ok(res, { q, posts: [...posts, ...clubPosts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), clubs, events, people });
}));

/** Campus Life entry: a small, real preview of what is happening in the community right now. */
socialRouter.get('/community/summary', h((req, res) => {
  const viewer = requireUser(req);
  const recent = db().all<SocialRow>('SELECT * FROM social_posts WHERE removed_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 30').filter((p) => canSeeSocial(p, viewer));
  const dayAgo = new Date(now().getTime() - 864e5).toISOString();
  const authors = [...new Set(recent.map((p) => p.author_id))].slice(0, 5).map((id) => personBrief(id));
  const workshops = db().all<{ id: string; title_en: string; title_ar: string; start_at: string; end_at: string; club_id: string | null; tags: string; location_id: string | null; venue_text: string | null }>("SELECT id, title_en, title_ar, start_at, end_at, club_id, tags, location_id, venue_text FROM events WHERE status <> 'cancelled' AND kind IN ('club','university') AND end_at >= ? ORDER BY start_at LIMIT 12", nowLocalIso())
    .slice(0, 3).map((e) => ({
      ...e, tags: pj<string[]>(e.tags, []), club: clubBrief(e.club_id),
      location_name_en: e.location_id ? (db().get<{ name_en: string }>('SELECT name_en FROM campus_locations WHERE id = ?', e.location_id)?.name_en ?? null) : e.venue_text,
      location_name_ar: e.location_id ? (db().get<{ name_ar: string }>('SELECT name_ar FROM campus_locations WHERE id = ?', e.location_id)?.name_ar ?? null) : e.venue_text,
      my_rsvp: (db().get<{ status: string }>("SELECT status FROM rsvps WHERE event_id = ? AND user_id = ? AND status IN ('going','waitlisted')", e.id, viewer.id)?.status) ?? null,
      going_count: db().count('rsvps', "event_id = ? AND status = 'going'", e.id)
    }));
  const latest = recent[0] ? socialView(recent[0], viewer) : null;
  ok(res, {
    posts_today: recent.filter((p) => p.created_at >= dayAgo).length,
    members: db().count('users', "stage IN ('current','graduating') AND (roles LIKE '%student%')"),
    authors,
    latest: latest ? { id: latest.id, body: latest.body.slice(0, 160), author: latest.author, created_at: latest.created_at, club: latest.club } : null,
    workshops,
    unread_messages: unreadConversations(viewer.id)
  });
}));

export function unreadConversations(userId: string) {
  return db().get<{ n: number }>(`SELECT COUNT(*) AS n FROM dm_conversations c WHERE (c.user_a = ? OR c.user_b = ?)
    AND EXISTS (SELECT 1 FROM dm_messages m WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.removed_at IS NULL
      AND m.rowid > CASE WHEN c.user_a = ? THEN c.a_read_seq ELSE c.b_read_seq END)
    AND NOT EXISTS (SELECT 1 FROM dm_blocks b WHERE b.blocker_id = ? AND b.blocked_id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END)`, userId, userId, userId, userId, userId, userId)?.n ?? 0;
}
