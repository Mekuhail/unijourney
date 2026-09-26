import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../core/db.ts';
import { h, ok, parse } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { nowIso } from '../../core/clock.ts';
import { audit } from '../../core/audit.ts';
import { demoMailbox } from '../../adapters/mailbox.ts';
import { acceptEmail, autoApplyEnabled, classifyEmail, dismissEmail, insertEmail, listEmails, setAutoApply } from './emails.ts';
import type { ApplicationRow } from './shared.ts';

export const emailsRouter = Router();

emailsRouter.get('/emails', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ status: z.string().optional() }), req.query);
  ok(res, { items: listEmails(u.id, q.status), mailbox: { provider: demoMailbox.provider, connected: demoMailbox.connected, simulated: true, note: 'Synthetic hiring emails only. Real Gmail/Microsoft 365 is not connected in the prototype.' }, autoApply: autoApplyEnabled(u.id) });
}));

emailsRouter.post('/emails/classify', h((req, res) => {
  const u = requireUser(req);
  const ids = db().all<{ id: string }>(`SELECT id FROM hiring_emails WHERE student_id = ? AND review_status IN ('pending')`, u.id).map((r) => r.id);
  const rows = ids.map((id) => classifyEmail(id));
  const autoApplied = rows.filter((r) => r.review_status === 'auto_applied').length;
  audit(u.id, 'career.email.classify', 'hiring_email', 'batch', { classified: rows.length, autoApplied });
  ok(res, { classified: rows.length, autoApplied, pending: rows.length - autoApplied, items: listEmails(u.id) });
}));

emailsRouter.post('/emails/simulate', h((req, res) => {
  const u = requireUser(req);
  const seq = db().count('hiring_emails', 'student_id = ?', u.id);
  const companies = db().all<ApplicationRow>(`SELECT company FROM applications WHERE student_id = ? AND status NOT IN ('rejected','withdrawn') ORDER BY created_at`, u.id).map((a) => a.company);
  const msg = demoMailbox.simulateMessage({ nowIso: nowIso(), seq, companies: companies.length ? companies : ['Demo Company'] });
  const row = insertEmail(u.id, msg);
  ok(res, { simulated: true, email: listEmails(u.id).find((e) => e.id === row.id) ?? row }, 201);
}));

emailsRouter.post('/emails/:id/accept', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ applicationId: z.string().optional().nullable() }), req.body);
  const r = acceptEmail(u, req.params.id as string, body.applicationId ?? null);
  ok(res, r);
}));

emailsRouter.post('/emails/:id/dismiss', h((req, res) => {
  const u = requireUser(req);
  ok(res, dismissEmail(u, req.params.id as string));
}));

emailsRouter.get('/settings', h((req, res) => {
  const u = requireUser(req);
  ok(res, { autoApplyEmails: autoApplyEnabled(u.id) });
}));
emailsRouter.put('/settings', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ autoApplyEmails: z.boolean() }), req.body);
  setAutoApply(u.id, body.autoApplyEmails);
  audit(u.id, 'career.settings', 'user', u.id, body);
  ok(res, { autoApplyEmails: body.autoApplyEmails });
}));
