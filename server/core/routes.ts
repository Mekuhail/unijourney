import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.ts';
import { db } from './db.ts';
import { ok, h, parse, bad, forbidden, notFound } from './http.ts';
import { attachUser, DEFAULT_PERSONA, getUser, listUsers, requireUser, SESSION_COOKIE, signSession } from './auth.ts';
import { listNotifications, markRead, unreadCount, listEmails, getEmail } from './notify.ts';
import { listEntries } from './calendar.ts';
import { createDocument, documentsOwnedBy, fileFromRequest, readDocumentFile, upload, getDocument, assertDocumentAccess } from './documents.ts';
import { listApprovals } from './approvals.ts';
import { getClockOverride, now, setClockOverride, TZ } from './clock.ts';
import { getPolicies, getSetting, setPolicy, setSetting } from './settings.ts';
import { adapterStatus } from '../adapters/index.ts';
import { audit } from './audit.ts';

export const coreRouter = Router();
coreRouter.use(attachUser());

// ---- session / personas -------------------------------------------------
coreRouter.get('/session/me', h((req, res) => {
  ok(res, { user: req.user ?? null, demoMode: config.demoMode, unread: req.user ? unreadCount(req.user.id) : 0 });
}));

coreRouter.get('/session/personas', h((req, res) => {
  if (!config.demoMode) throw forbidden('Persona switching is only available in demo mode');
  ok(res, listUsers().map((u) => ({ id: u.id, name_en: u.name_en, name_ar: u.name_ar, roles: u.roles, stage: u.stage, campus_id: u.campus_id, avatar_color: u.avatar_color, program_id: u.program_id, department: u.department })));
}));

coreRouter.post('/session/switch', h((req, res) => {
  if (!config.demoMode) throw forbidden('Persona switching is only available in demo mode');
  const { personaId } = parse(z.object({ personaId: z.string().min(1) }), req.body);
  const u = getUser(personaId);
  if (!u) throw notFound('Unknown persona');
  res.cookie(SESSION_COOKIE, signSession(u.id), { httpOnly: true, sameSite: 'lax', path: '/' });
  audit(req.user?.id ?? null, 'session.switch', 'user', u.id, {});
  ok(res, { user: u });
}));

coreRouter.post('/session/locale', h((req, res) => {
  const u = requireUser(req);
  const { locale } = parse(z.object({ locale: z.enum(['en', 'ar']) }), req.body);
  db().update('users', u.id, { locale });
  ok(res, { locale });
}));

// ---- notifications -----------------------------------------------------
coreRouter.get('/notifications', h((req, res) => {
  const u = requireUser(req);
  ok(res, { items: listNotifications(u.id), unread: unreadCount(u.id) });
}));
coreRouter.post('/notifications/:id/read', h((req, res) => {
  const u = requireUser(req);
  markRead(u.id, req.params.id as string);
  ok(res, { unread: unreadCount(u.id) });
}));

coreRouter.get('/emails', h((req, res) => {
  const u = requireUser(req);
  ok(res, listEmails(u.id));
}));
coreRouter.get('/emails/:id', h((req, res) => {
  const u = requireUser(req);
  const e = getEmail(req.params.id as string);
  if (!e) throw notFound();
  if (e.to_user_id !== u.id && !u.roles.includes('security') && !u.roles.includes('operator')) throw forbidden();
  ok(res, e);
}));

// ---- calendar ----------------------------------------------------------
coreRouter.get('/calendar', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
  ok(res, listEntries(u.id, q.from, q.to));
}));

// ---- documents ---------------------------------------------------------
coreRouter.get('/documents', h((req, res) => {
  const u = requireUser(req);
  const q = parse(z.object({ kind: z.string().optional() }), req.query);
  ok(res, documentsOwnedBy(u.id, q.kind as never));
}));
coreRouter.post('/documents', upload.single('file'), h((req, res) => {
  const u = requireUser(req);
  const body = parse(z.object({ kind: z.enum(['medical', 'event_evidence', 'admission', 'lost_item', 'resource', 'cv', 'other']), label: z.string().max(200).optional() }), req.body);
  const doc = createDocument(u, body.kind, fileFromRequest(req), body.label);
  audit(u.id, 'document.upload', 'document', doc.id, { kind: doc.kind, size: doc.size });
  ok(res, doc, 201);
}));
coreRouter.get('/documents/:id', h((req, res) => {
  const u = requireUser(req);
  const doc = getDocument(req.params.id as string);
  if (!doc) throw notFound();
  assertDocumentAccess(doc, u);
  ok(res, doc);
}));
coreRouter.get('/documents/:id/file', h((req, res) => {
  const u = requireUser(req);
  const { doc, filePath } = readDocumentFile(req.params.id as string, u);
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
}));

// ---- approvals ---------------------------------------------------------
coreRouter.get('/approvals', h((req, res) => {
  const u = requireUser(req);
  ok(res, listApprovals(u.id));
}));

// ---- policies / demo ---------------------------------------------------
coreRouter.get('/policies', h((_req, res) => ok(res, getPolicies())));
coreRouter.put('/policies/:key', h((req, res) => {
  const u = requireUser(req);
  if (!config.demoMode && !u.roles.includes('operator')) throw forbidden();
  const key = req.params.key as keyof ReturnType<typeof getPolicies>;
  if (!(key in getPolicies())) throw bad('Unknown policy');
  const { value, provenance } = parse(z.object({ value: z.unknown(), provenance: z.string().optional() }), req.body);
  ok(res, setPolicy(key, value as never, provenance));
}));

coreRouter.get('/demo/status', h((_req, res) => {
  ok(res, {
    demoMode: config.demoMode,
    clock: now().toISOString(),
    clockOverride: getClockOverride(),
    tz: TZ,
    adapters: adapterStatus(),
    aiConfigured: !!config.anthropicKey,
    googleMapsConfigured: !!config.googleMapsKey,
    seededAt: getSetting<string | null>('seeded_at', null)
  });
}));

coreRouter.post('/demo/clock', h((req, res) => {
  if (!config.demoMode) throw forbidden();
  const body = parse(z.object({ iso: z.string().nullable().optional(), advanceMinutes: z.number().int().optional() }), req.body);
  if (body.advanceMinutes !== undefined) {
    const base = now();
    setClockOverride(new Date(base.getTime() + body.advanceMinutes * 60000).toISOString());
  } else if (body.iso !== undefined) {
    setClockOverride(body.iso);
  }
  setSetting('demo_clock', getClockOverride());
  ok(res, { clock: now().toISOString(), clockOverride: getClockOverride() });
}));

coreRouter.get('/config/public', h((_req, res) => {
  ok(res, { googleMapsKey: config.googleMapsKey || null, cartoKey: config.cartoKey || null, demoMode: config.demoMode });
}));

// ---- today aggregate ---------------------------------------------------
import { buildToday } from './today.ts';
coreRouter.get('/today', h((req, res) => {
  const u = requireUser(req);
  ok(res, buildToday(u));
}));
