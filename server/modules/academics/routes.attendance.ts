import { Router } from 'express';
import { z } from 'zod';
import { h, ok, parse, forbidden } from '../../core/http.ts';
import { hasRole, requireRole, requireUser } from '../../core/auth.ts';
import { CURRENT_TERM } from '../../core/settings.ts';
import { approveExcuse, attachEvidence, attendanceOverview, createExcuse, draftFromEvent, excuseView, getExcuseRow, listExcuses, rerunExtraction, resolveAbsenceText, reviewQueue, reviewerDecision, reviewerGet, submitExcuse, updateExcuse, REVIEWABLE, type ExcuseStatus } from './excuses.ts';

export const attendanceRouter = Router();

attendanceRouter.get('/attendance', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ term: z.string().optional() }), req.query);
  ok(res, attendanceOverview(u.id, q.term ?? CURRENT_TERM));
}));

// ---- excuses (student) ---------------------------------------------------
attendanceRouter.post('/excuses/resolve', h((req, res) => {
  const u = requireUser(req);
  const { text } = parse(z.object({ text: z.string().min(1).max(300) }), req.body ?? {});
  ok(res, resolveAbsenceText(u, text));
}));

attendanceRouter.post('/excuses/draft-from-event', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ eventId: z.string().min(1), attendanceIds: z.array(z.string().min(1)).min(1).max(10) }), req.body ?? {});
  ok(res, draftFromEvent(u, body.eventId, body.attendanceIds), 201);
}));

attendanceRouter.post('/excuses', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ attendanceIds: z.array(z.string().min(1)).min(1).max(10), type: z.enum(['medical', 'event', 'other']).default('medical'), reason: z.string().max(2000).optional() }), req.body ?? {});
  ok(res, createExcuse(u, body.attendanceIds, body.type, { reason: body.reason }), 201);
}));

attendanceRouter.get('/excuses', h((req, res) => {
  const u = requireUser(req);
  ok(res, listExcuses(u.id));
}));

attendanceRouter.get('/excuses/:id', h((req, res) => {
  const u = requireUser(req);
  const r = getExcuseRow(req.params.id as string);
  if (r.student_id === u.id) return ok(res, excuseView(r));
  if (hasRole(u, 'reviewer') && [...REVIEWABLE, 'accepted', 'rejected'].includes(r.status as ExcuseStatus)) return ok(res, excuseView(r, { withStudent: true }));
  throw forbidden();
}));

attendanceRouter.put('/excuses/:id', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ reason: z.string().max(2000).optional(), from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), reference: z.string().max(80).nullable().optional(), type: z.enum(['medical', 'event', 'other']).optional() }).strict(), req.body ?? {});
  ok(res, updateExcuse(u, req.params.id as string, body));
}));

attendanceRouter.post('/excuses/:id/evidence', h((req, res) => {
  const u = requireUser(req);
  const { documentId } = parse(z.object({ documentId: z.string().min(1) }), req.body ?? {});
  ok(res, attachEvidence(u, req.params.id as string, documentId));
}));

attendanceRouter.post('/excuses/:id/extract', h((req, res) => {
  const u = requireUser(req);
  ok(res, rerunExtraction(u, req.params.id as string));
}));

attendanceRouter.post('/excuses/:id/approve', h((req, res) => {
  const u = requireUser(req);
  ok(res, approveExcuse(u, req.params.id as string));
}));

attendanceRouter.post('/excuses/:id/submit', h((req, res) => {
  const u = requireUser(req);
  const { approvalId } = parse(z.object({ approvalId: z.string().min(1) }), req.body ?? {});
  ok(res, submitExcuse(u, req.params.id as string, approvalId));
}));

// ---- reviewer queue --------------------------------------------------------
attendanceRouter.get('/review/excuses', h((req, res) => {
  requireRole(req, 'reviewer');
  const q = parse(z.object({ status: z.string().optional() }), req.query);
  ok(res, reviewQueue(q.status || undefined));
}));

attendanceRouter.get('/review/excuses/:id', h((req, res) => {
  requireRole(req, 'reviewer');
  ok(res, reviewerGet(req.params.id as string));
}));

attendanceRouter.post('/review/excuses/:id/decision', h((req, res) => {
  const reviewer = requireRole(req, 'reviewer');
  const body = parse(z.object({ decision: z.enum(['accepted', 'rejected', 'needs_information']), note: z.string().min(3).max(2000) }), req.body ?? {});
  ok(res, reviewerDecision(reviewer, req.params.id as string, body.decision, body.note));
}));
