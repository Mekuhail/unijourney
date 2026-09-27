import { Router } from 'express';
import { z } from 'zod';
import type { User } from '../../../shared/types.ts';
import { db } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, unprocessable, HttpError } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { newId } from '../../core/ids.ts';
import { now, nowIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { checkText } from '../../core/moderation.ts';
import { fileReport, isBlocked, messagePermission, personBrief, REPORT_REASONS, unreadConversations } from './social.ts';

/**
 * One-to-one text messages between students. Only the two participants can read or send; a non-participant gets 404
 * (the conversation's existence is not revealed). A block stops both directions; a report sends the single reported
 * message (never the thread) to the moderator queue. Delivery is polling-friendly: the thread accepts `?after=<seq>`.
 */
export const messagesRouter = Router();

interface Conv { id: string; user_a: string; user_b: string; created_at: string; last_message_at: string | null; a_read_seq: number; b_read_seq: number }

const other = (c: Conv, me: string) => (c.user_a === me ? c.user_b : c.user_a);
const readSeqOf = (c: Conv, me: string) => (c.user_a === me ? c.a_read_seq : c.b_read_seq);

function participantConv(id: string, me: User): Conv {
  const c = db().get<Conv>('SELECT * FROM dm_conversations WHERE id = ?', id);
  if (!c || (c.user_a !== me.id && c.user_b !== me.id)) throw notFound('Conversation not found');
  return c;
}

function markRead(c: Conv, me: string) {
  const max = db().get<{ s: number | null }>('SELECT MAX(rowid) AS s FROM dm_messages WHERE conversation_id = ?', c.id)?.s ?? 0;
  if (max > readSeqOf(c, me)) db().run(`UPDATE dm_conversations SET ${c.user_a === me ? 'a_read_seq' : 'b_read_seq'} = ? WHERE id = ?`, max, c.id);
  // The message notification for this thread is read too, so the bell and the thread agree.
  db().run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'message' AND link = ? AND read_at IS NULL", nowIso(), me, `/campus/community/messages/${c.id}`);
}

function conversationSummary(c: Conv, me: User) {
  const otherId = other(c, me.id);
  const last = db().get<{ body: string; sender_id: string; created_at: string; removed_at: string | null }>('SELECT body, sender_id, created_at, removed_at FROM dm_messages WHERE conversation_id = ? ORDER BY rowid DESC LIMIT 1', c.id);
  const unread = db().get<{ n: number }>('SELECT COUNT(*) AS n FROM dm_messages WHERE conversation_id = ? AND sender_id <> ? AND removed_at IS NULL AND rowid > ?', c.id, me.id, readSeqOf(c, me.id))?.n ?? 0;
  const blockedByMe = !!db().get('SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', me.id, otherId);
  return {
    id: c.id,
    other: personBrief(otherId),
    last: last ? { body: last.removed_at ? null : last.body.slice(0, 120), mine: last.sender_id === me.id, created_at: last.created_at } : null,
    unread: blockedByMe ? 0 : unread,
    blocked_by_me: blockedByMe,
    can_send: !isBlocked(me.id, otherId)
  };
}

messagesRouter.get('/community/messages', h((req, res) => {
  const me = requireUser(req);
  const rows = db().all<Conv>('SELECT * FROM dm_conversations WHERE user_a = ? OR user_b = ?', me.id, me.id);
  const items = rows.map((c) => ({ c, seq: db().get<{ s: number | null }>('SELECT MAX(rowid) AS s FROM dm_messages WHERE conversation_id = ?', c.id)?.s ?? 0 }))
    .sort((a, b) => b.seq - a.seq).map(({ c }) => conversationSummary(c, me));
  ok(res, { items, unread: unreadConversations(me.id) });
}));

messagesRouter.get('/community/messages/unread', h((req, res) => {
  const me = requireUser(req);
  ok(res, { conversations: unreadConversations(me.id) });
}));

messagesRouter.post('/community/messages/start', h((req, res) => {
  const me = requireUser(req);
  const b = parse(z.object({ user_id: z.string() }), req.body);
  const [a, bb] = [me.id, b.user_id].sort();
  const existing = db().get<Conv>('SELECT * FROM dm_conversations WHERE user_a = ? AND user_b = ?', a, bb);
  if (existing) return ok(res, { id: existing.id, created: false });
  const perm = messagePermission(me, b.user_id);
  if (!perm.allowed) throw new HttpError(403, 'forbidden', perm.reason === 'closed' ? 'This student is not accepting new messages.' : perm.reason === 'club_mates' ? 'This student accepts messages only from people in their clubs.' : perm.reason === 'you_blocked' ? 'Unblock this student first.' : 'You cannot message this person.', { reason: perm.reason });
  const id = newId('dm');
  db().insert('dm_conversations', { id, user_a: a, user_b: bb, created_at: nowIso(), last_message_at: null, a_read_seq: 0, b_read_seq: 0 });
  audit(me.id, 'community.dm.start', 'dm_conversation', id, {});
  ok(res, { id, created: true }, 201);
}));

function messagesView(c: Conv, me: User, after = 0) {
  return db().all<{ seq: number; id: string; sender_id: string; body: string; created_at: string; removed_at: string | null }>('SELECT rowid AS seq, id, sender_id, body, created_at, removed_at FROM dm_messages WHERE conversation_id = ? AND rowid > ? ORDER BY rowid LIMIT 200', c.id, after)
    .map((m) => ({ id: m.id, seq: m.seq, mine: m.sender_id === me.id, body: m.removed_at ? null : m.body, removed: !!m.removed_at, created_at: m.created_at }));
}

messagesRouter.get('/community/messages/:id', h((req, res) => {
  const me = requireUser(req);
  const c = participantConv(req.params.id as string, me);
  const after = Number(req.query.after ?? 0) || 0;
  const messages = messagesView(c, me, after);
  markRead(c, me.id);
  const fresh = db().get<Conv>('SELECT * FROM dm_conversations WHERE id = ?', c.id)!;
  const otherId = other(c, me.id);
  // The other side's read marker gives a simple "Seen" on your latest message.
  const theirRead = c.user_a === otherId ? fresh.a_read_seq : fresh.b_read_seq;
  ok(res, { conversation: conversationSummary(fresh, me), messages, their_read_seq: theirRead });
}));

messagesRouter.post('/community/messages/:id', h((req, res) => {
  const me = requireUser(req);
  const c = participantConv(req.params.id as string, me);
  const b = parse(z.object({ body: z.string().trim().min(1).max(1000) }), req.body);
  const otherId = other(c, me.id);
  if (isBlocked(me.id, otherId)) throw forbidden('Messages are turned off in this conversation.');
  const check = checkText(b.body);
  if (check.flags.includes('abusive')) throw unprocessable('Please rephrase: the message contains language that breaks the community guidelines.', { flags: check.flags });
  const minuteAgo = new Date(now().getTime() - 60e3).toISOString();
  if (db().count('dm_messages', 'sender_id = ? AND created_at >= ?', me.id, minuteAgo) >= 20) throw new HttpError(429, 'rate_limited', 'You are sending messages too quickly. Wait a moment.');
  const id = newId('msg');
  const at = nowIso();
  db().tx(() => {
    const r = db().insert('dm_messages', { id, conversation_id: c.id, sender_id: me.id, body: b.body, created_at: at, removed_at: null });
    db().run(`UPDATE dm_conversations SET last_message_at = ?, ${c.user_a === me.id ? 'a_read_seq' : 'b_read_seq'} = ? WHERE id = ?`, at, Number(r.lastInsertRowid), c.id);
    // One unread notification per conversation: update it instead of stacking a new one for every message.
    const link = `/campus/community/messages/${c.id}`;
    const who = personBrief(me.id)!;
    const open = db().get<{ id: string }>("SELECT id FROM notifications WHERE user_id = ? AND kind = 'message' AND link = ? AND read_at IS NULL", otherId, link);
    if (open) db().run('UPDATE notifications SET title = ?, body = ?, created_at = ? WHERE id = ?', `New message from ${who.name_en}`, b.body.slice(0, 140), at, open.id);
    else db().insert('notifications', { id: newId('ntf'), user_id: otherId, module: 'community', kind: 'message', title: `New message from ${who.name_en}`, body: b.body.slice(0, 140), link, read_at: null, created_at: at });
  });
  const seq = db().get<{ seq: number }>('SELECT rowid AS seq FROM dm_messages WHERE id = ?', id)!.seq;
  ok(res, { id, seq, mine: true, body: b.body, removed: false, created_at: at }, 201);
}));

messagesRouter.post('/community/messages/:id/report', h((req, res) => {
  const me = requireUser(req);
  const c = participantConv(req.params.id as string, me);
  const b = parse(z.object({ message_id: z.string(), reason: z.enum(REPORT_REASONS), note: z.string().trim().max(300).optional(), block: z.boolean().optional() }), req.body);
  const m = db().get<{ sender_id: string }>('SELECT sender_id FROM dm_messages WHERE id = ? AND conversation_id = ?', b.message_id, c.id);
  if (!m) throw notFound('Message not found');
  if (m.sender_id === me.id) throw forbidden('You cannot report your own message');
  const r = fileReport(me, 'message', b.message_id, b.reason, b.note);
  if (b.block) db().run('INSERT OR IGNORE INTO dm_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, m.sender_id, nowIso());
  ok(res, { ...r, blocked: !!b.block }, r.created ? 201 : 200);
}));

messagesRouter.post('/community/blocks', h((req, res) => {
  const me = requireUser(req);
  const b = parse(z.object({ user_id: z.string() }), req.body);
  if (b.user_id === me.id) throw unprocessable('You cannot block yourself');
  if (!personBrief(b.user_id)) throw notFound('Person not found');
  db().run('INSERT OR IGNORE INTO dm_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, b.user_id, nowIso());
  audit(me.id, 'community.block', 'user', b.user_id, {});
  ok(res, { blocked: true });
}));

messagesRouter.delete('/community/blocks/:userId', h((req, res) => {
  const me = requireUser(req);
  db().run('DELETE FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?', me.id, req.params.userId as string);
  ok(res, { blocked: false });
}));
