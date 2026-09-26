import type { Notification } from '../../shared/types.ts';
import { db } from './db.ts';
import { newId } from './ids.ts';
import { nowIso } from './clock.ts';

export interface NotifyInput {
  module: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

export function notify(userId: string, n: NotifyInput): Notification {
  const row: Notification = {
    id: newId('ntf'),
    user_id: userId,
    module: n.module,
    kind: n.kind,
    title: n.title,
    body: n.body ?? '',
    link: n.link ?? null,
    read_at: null,
    created_at: nowIso()
  };
  db().insert('notifications', row as unknown as Record<string, unknown>);
  return row;
}

export function listNotifications(userId: string, limit = 50): Notification[] {
  return db().all<Notification>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit);
}

export function unreadCount(userId: string): number {
  return db().count('notifications', 'user_id = ? AND read_at IS NULL', userId);
}

export function markRead(userId: string, id: string | 'all') {
  if (id === 'all') db().run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowIso(), userId);
  else db().run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ?', nowIso(), userId, id);
}

/**
 * NotificationAdapter (demo provider): outgoing email is never sent. It is rendered and stored in the
 * outbox so the demo can show an email preview. A real SMTP provider would implement the same call.
 */
export interface EmailInput {
  toUserId?: string;
  toAddress: string;
  subject: string;
  html: string;
  text: string;
  module: string;
}

export function sendEmail(e: EmailInput): { id: string; status: 'simulated' } {
  const id = newId('eml');
  db().insert('email_outbox', {
    id,
    to_user_id: e.toUserId ?? null,
    to_address: e.toAddress,
    subject: e.subject,
    html: e.html,
    text: e.text,
    status: 'simulated',
    module: e.module,
    created_at: nowIso()
  });
  return { id, status: 'simulated' };
}

export function listEmails(userId: string) {
  return db().all('SELECT id, to_address, subject, status, module, created_at FROM email_outbox WHERE to_user_id = ? ORDER BY created_at DESC', userId);
}

export function getEmail(id: string) {
  return db().get('SELECT * FROM email_outbox WHERE id = ?', id);
}
