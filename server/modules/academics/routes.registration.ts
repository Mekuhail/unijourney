import { Router } from 'express';
import { z } from 'zod';
import { h, ok, parse } from '../../core/http.ts';
import { requireUser } from '../../core/auth.ts';
import { NEXT_TERM } from '../../core/settings.ts';
import { studentContext } from './common.ts';
import { analyzeEligibility } from './planner.ts';
import { approveProposal, createProposal, listProposals, proposalView, reconcileProposal, requireOwnProposal, submitProposal, updateProposal } from './registration.ts';

export const registrationRouter = Router();

const keepWindow = z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), label: z.string().max(120).optional() });
const preferences = z.object({
  text: z.string().max(600).optional(),
  avoidEarly: z.boolean().optional(),
  avoidDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  keepWindows: z.array(keepWindow).max(10).optional(),
  maxCredits: z.number().int().min(1).max(24).optional(),
  pinned: z.array(z.string()).max(12).optional(),
  courses: z.array(z.string()).max(12).optional(),
  countInProgress: z.boolean().optional(),
  compact: z.boolean().optional(),
  lightLoad: z.boolean().optional()
}).strict();

registrationRouter.post('/proposals', h(async (req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ term: z.string().default(NEXT_TERM), preferences: preferences.default({}) }), req.body ?? {});
  ok(res, await createProposal(u, body.term, body.preferences), 201);
}));

registrationRouter.get('/proposals', h((req, res) => {
  const u = requireUser(req);
  ok(res, listProposals(u.id));
}));

registrationRouter.get('/proposals/:id', h((req, res) => {
  const u = requireUser(req);
  const r = requireOwnProposal(u, req.params.id as string);
  const ctx = studentContext(u.id);
  const view = proposalView(r);
  ok(res, { proposal: view, eligibility: analyzeEligibility(ctx, r.term as string, view.preferences) });
}));

registrationRouter.put('/proposals/:id', h(async (req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({
    optionId: z.string().max(4).optional(),
    add: z.string().optional(), remove: z.string().optional(),
    swap: z.object({ from: z.string(), to: z.string() }).optional(),
    pinned: z.array(z.string()).max(12).optional(),
    sectionIds: z.array(z.string()).max(12).optional(),
    preferences: preferences.optional(),
    expectedRevision: z.number().int().min(1).optional()
  }).strict(), req.body ?? {});
  ok(res, await updateProposal(u, req.params.id as string, body));
}));

registrationRouter.post('/proposals/:id/approve', h((req, res) => {
  const u = requireUser(req);
  ok(res, approveProposal(u, req.params.id as string));
}));

registrationRouter.post('/proposals/:id/submit', h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ approvalId: z.string().min(1), simulate: z.enum(['timeout', 'stale_capacity', 'partial']).optional() }), req.body ?? {});
  const result = submitProposal(u, req.params.id as string, body.approvalId, body.simulate);
  ok(res, result, result.outcome === 'outcome_unknown' ? 202 : 200);
}));

registrationRouter.get('/proposals/:id/status', h((req, res) => {
  const u = requireUser(req);
  ok(res, reconcileProposal(u, req.params.id as string));
}));
