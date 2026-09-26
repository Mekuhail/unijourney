import { Router } from 'express';
import { z } from 'zod';
import { db, pj } from '../../core/db.ts';
import { h, ok, parse, forbidden, notFound, bad, conflict } from '../../core/http.ts';
import { hasRole, requireRole, requireUser } from '../../core/auth.ts';
import { newId, publicRef } from '../../core/ids.ts';
import { addDays, nowIso, todayIso, toLocal, diffDays } from '../../core/clock.ts';
import { notify, sendEmail } from '../../core/notify.ts';
import { audit } from '../../core/audit.ts';
import { getDocument } from '../../core/documents.ts';
import type { User } from '../../../shared/types.ts';
import { escapeHtml, getLocation, locationSummary, pushTimeline, userBrief, type TimelineItem } from './shared.ts';

export const lostFoundRouter = Router();

export const LF_CATEGORIES = ['bags', 'electronics', 'documents', 'keys', 'clothing', 'accessories', 'books', 'other'] as const;
export const LF_STATUSES = ['reported', 'searching', 'found', 'ready_for_collection', 'collected', 'closed'] as const;
const COLLECTION_KINDS = ['security', 'service', 'building'];

interface LfRow {
  id: string; public_id: string; owner_id: string; campus_id: string; item: string; category: string; lost_date: string; last_location_id: string | null; last_location_text: string;
  description: string; contact_email: string; document_id: string | null; status: string; collection_location_id: string | null; collection_note: string | null;
  found_by: string | null; found_at: string | null; handover: string | null; timeline: string; created_at: string; updated_at: string;
}

function getReq(id: string): LfRow {
  const r = db().get<LfRow>('SELECT * FROM lost_found_requests WHERE id = ? OR public_id = ?', id, id.toUpperCase());
  if (!r) throw notFound('Request not found');
  return r;
}

const isSecurity = (u: User) => hasRole(u, 'security');

function fullView(r: LfRow, viewer: User) {
  const doc = r.document_id ? getDocument(r.document_id) : null;
  return {
    ...r,
    timeline: pj<TimelineItem[]>(r.timeline, []),
    handover: pj<Record<string, unknown> | null>(r.handover, null),
    owner: userBrief(r.owner_id),
    last_location: locationSummary(r.last_location_id),
    collection_location: locationSummary(r.collection_location_id),
    document: doc ? { id: doc.id, filename: doc.filename, mime: doc.mime, size: doc.size, url: `/api/documents/${doc.id}/file` } : null,
    found_by_user: userBrief(r.found_by),
    map_link: r.collection_location_id ? `/campus/map?to=${r.collection_location_id}` : null,
    email_id: pj<TimelineItem[]>(r.timeline, []).map((t) => t.email_id).filter(Boolean).pop() ?? null,
    is_owner: r.owner_id === viewer.id,
    reported_local_date: toLocal(r.created_at).date,
    matched_found_items: db().all('SELECT id, item, category, found_date, held_at_location_id, status FROM found_items WHERE matched_request_id = ?', r.id)
  };
}

/** Minimal projection: what an ID alone may reveal (no personal or distinguishing details). */
function minimalView(r: LfRow) {
  return { public_id: r.public_id, status: r.status, updated_at: r.updated_at, restricted: true, note: 'Sign in as the request owner to see item details, or ask the security desk.' };
}

function suggestedMatches(fi: { id: string; item: string; category: string; description: string; campus_id: string; found_location_id: string | null; found_date: string }) {
  const open = db().all<LfRow>("SELECT * FROM lost_found_requests WHERE status IN ('reported','searching') ORDER BY created_at DESC");
  const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 2 && !['the', 'and', 'with', 'for'].includes(w)));
  const fiTokens = new Set([...tokens(fi.item), ...tokens(fi.description)]);
  const results = open.map((r) => {
    let score = 0;
    const reasons: string[] = [];
    if (r.category === fi.category) { score += 3; reasons.push('same category'); }
    if (r.campus_id === fi.campus_id) { score += 2; reasons.push('same campus'); }
    const dd = diffDays(r.lost_date, fi.found_date);
    if (dd >= 0 && dd <= 7) { score += 2; reasons.push(`found ${dd} day${dd === 1 ? '' : 's'} after it was lost`); }
    if (fi.found_location_id && r.last_location_id === fi.found_location_id) { score += 2; reasons.push('same location'); }
    const overlap = [...tokens(`${r.item} ${r.description}`)].filter((w) => fiTokens.has(w));
    if (overlap.length) { score += Math.min(3, overlap.length); reasons.push(`keywords: ${overlap.slice(0, 3).join(', ')}`); }
    return { request_id: r.id, public_id: r.public_id, item: r.item, category: r.category, lost_date: r.lost_date, last_location: locationSummary(r.last_location_id)?.name_en ?? r.last_location_text, status: r.status, owner: userBrief(r.owner_id), score, reasons };
  }).filter((m) => m.score >= 3).sort((a, b) => b.score - a.score);
  return results;
}

// ------------------------------------------------------------------ YU-branded email
export function foundEmailHtml(p: { name: string; item: string; publicId: string; location: string; note?: string | null; description?: string }) {
  const e = escapeHtml;
  return `<!doctype html><html><body style="margin:0;background:#f4efe8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1e1b18">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e1d9">
<tr><td style="background:#1e1b18;padding:20px 28px;color:#fff">
  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c8975b">Al Yamamah University · YU Claimed (demo)</div>
  <div style="font-size:22px;font-weight:700;margin-top:6px">Your item has been found</div>
</td></tr>
<tr><td style="padding:26px 28px">
  <p style="margin:0 0 12px;font-size:16px">Dear ${e(p.name)},</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.55">Great news – the item you reported through YU Claimed has been found and is ready for collection.</p>
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border:1px solid #e8e1d9;border-radius:12px;font-size:14px">
    <tr><td style="padding:10px 14px;color:#6b635c;width:42%;border-bottom:1px solid #e8e1d9">Item details</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #e8e1d9">${e(p.item)}${p.description ? `<div style="font-weight:400;color:#6b635c;font-size:13px">${e(p.description)}</div>` : ''}</td></tr>
    <tr><td style="padding:10px 14px;color:#6b635c;border-bottom:1px solid #e8e1d9">Request ID</td><td style="padding:10px 14px;font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:.08em;color:#9a6d35;border-bottom:1px solid #e8e1d9">${e(p.publicId)}</td></tr>
    <tr><td style="padding:10px 14px;color:#6b635c">Collection point</td><td style="padding:10px 14px;font-weight:600">${e(p.location)}</td></tr>
  </table>
  <div style="margin:20px 0 6px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#c8975b;font-weight:700">Collection instructions</div>
  <ol style="margin:0;padding-inline-start:20px;font-size:14px;line-height:1.7">
    <li>Bring your student ID card.</li>
    <li>Go to the security desk at <strong>${e(p.location)}</strong> during working hours.</li>
    <li>Provide your request ID <strong>${e(p.publicId)}</strong> to the officer.</li>
  </ol>
  ${p.note ? `<p style="margin:16px 0 0;font-size:13px;color:#6b635c">Note from security: ${e(p.note)}</p>` : ''}
  <p style="margin:22px 0 0;font-size:13px;color:#6b635c">Track your request any time at <span style="color:#9a6d35">UniJourney → Campus Life → Lost &amp; found → Check status</span>.</p>
</td></tr>
<tr><td style="background:#fbf8f4;padding:14px 28px;font-size:11px;color:#8f857b;border-top:1px solid #e8e1d9">Demo message generated by the UniJourney prototype. Nothing was sent to a real inbox; all names are synthetic.</td></tr>
</table></td></tr></table></body></html>`;
}

function foundEmailText(p: { name: string; item: string; publicId: string; location: string; note?: string | null }) {
  return `Dear ${p.name},\n\nGreat news - the item you reported through YU Claimed has been found and is ready for collection.\n\nItem details: ${p.item}\nRequest ID: ${p.publicId}\nCollection point: ${p.location}\n\nCollection instructions:\n1. Bring your student ID card.\n2. Go to the security desk at ${p.location}.\n3. Provide your request ID ${p.publicId}.\n${p.note ? `\nNote from security: ${p.note}\n` : ''}\n(Demo message – not sent to a real inbox.)`;
}

// ------------------------------------------------------------------ student: create / mine / status
const createSchema = z.object({
  item: z.string().min(2).max(120),
  category: z.enum(LF_CATEGORIES).optional(),
  lost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  last_location_id: z.string().nullable().optional(),
  last_location_text: z.string().max(160).optional(),
  description: z.string().max(1500).optional(),
  contact_email: z.email().optional(),
  documentId: z.string().nullable().optional(),
  campus_id: z.enum(['riyadh', 'khobar']).optional()
});

lostFoundRouter.post('/lost-found', h((req, res) => {
  const u = requireUser(req);
  const body = parse(createSchema, req.body);
  if (body.lost_date > todayIso()) throw bad('Lost date cannot be in the future');
  if (body.lost_date < addDays(todayIso(), -365)) throw bad('Lost date is more than a year ago');
  const loc = body.last_location_id ? getLocation(body.last_location_id) : null;
  if (body.last_location_id && !loc) throw bad('Unknown location');
  if (!loc && !(body.last_location_text && body.last_location_text.trim())) throw bad('Tell us where you last saw the item (pick a place or describe it)');
  let documentId: string | null = null;
  if (body.documentId) {
    const doc = getDocument(body.documentId);
    if (!doc || doc.owner_id !== u.id) throw forbidden('Attachment must be one you uploaded');
    if (doc.kind !== 'lost_item') throw bad("Attachment must be uploaded with kind 'lost_item'");
    documentId = doc.id;
  }
  const now = nowIso();
  const id = newId('lf');
  let publicId = publicRef('YU');
  while (db().get('SELECT 1 FROM lost_found_requests WHERE public_id = ?', publicId)) publicId = publicRef('YU');
  const row: LfRow = {
    id, public_id: publicId, owner_id: u.id, campus_id: body.campus_id ?? loc?.campus_id ?? u.campus_id, item: body.item.trim(), category: body.category ?? 'other', lost_date: body.lost_date,
    last_location_id: loc?.id ?? null, last_location_text: (body.last_location_text ?? loc?.name_en ?? '').trim(), description: (body.description ?? '').trim(), contact_email: body.contact_email ?? u.email,
    document_id: documentId, status: 'reported', collection_location_id: null, collection_note: null, found_by: null, found_at: null, handover: null,
    timeline: JSON.stringify([{ at: now, status: 'reported', by: u.id, note: 'Request submitted by the student.' }]), created_at: now, updated_at: now
  };
  db().tx(() => {
    db().insert('lost_found_requests', { ...row });
    for (const s of db().all("SELECT id FROM users WHERE roles LIKE '%security%'")) {
      notify(s.id as string, { module: 'campus', kind: 'lost_found_new', title: `New lost item report: ${row.item}`, body: `${publicId} · last seen at ${row.last_location_text}`, link: `/staff/campus/lost-found?request=${id}` });
    }
    audit(u.id, 'lost_found.create', 'lost_found_request', id, { public_id: publicId });
  });
  ok(res, fullView(row, u), 201);
}));

lostFoundRouter.get('/lost-found/mine', h((req, res) => {
  const u = requireUser(req);
  ok(res, db().all<LfRow>('SELECT * FROM lost_found_requests WHERE owner_id = ? ORDER BY created_at DESC', u.id).map((r) => fullView(r, u)));
}));

lostFoundRouter.get('/lost-found/status/:publicId', h((req, res) => {
  const pid = (req.params.publicId as string).trim().toUpperCase();
  const r = db().get<LfRow>('SELECT * FROM lost_found_requests WHERE public_id = ?', pid);
  if (!r) throw notFound('No request with this ID. Check the ID (format YU-XXXX-XXXXX).');
  const u = req.user ?? null;
  if (u && (r.owner_id === u.id || isSecurity(u))) return ok(res, fullView(r, u));
  ok(res, minimalView(r));
}));

lostFoundRouter.get('/lost-found/locations', h((req, res) => {
  const q = parse(z.object({ campus: z.string().optional() }), req.query);
  const rows = db().all('SELECT id, campus_id, kind, name_en, name_ar, building_id FROM campus_locations WHERE searchable = 1 AND kind <> \'junction\'' + (q.campus ? ' AND campus_id = ?' : '') + ' ORDER BY campus_id, name_en', ...(q.campus ? [q.campus] : []));
  ok(res, { locations: rows, collection_points: rows.filter((r) => COLLECTION_KINDS.includes(r.kind as string)), categories: LF_CATEGORIES });
}));

lostFoundRouter.get('/lost-found/:id', h((req, res) => {
  const u = requireUser(req);
  const r = getReq(req.params.id as string);
  if (r.owner_id !== u.id && !isSecurity(u)) throw forbidden();
  ok(res, fullView(r, u));
}));

// ------------------------------------------------------------------ security desk
lostFoundRouter.get('/security/lost-found', h((req, res) => {
  const u = requireRole(req, 'security');
  const q = parse(z.object({ date: z.enum(['today', 'yesterday', 'all']).optional(), status: z.string().optional(), campus: z.string().optional() }), req.query);
  const today = todayIso();
  const rows = db().all<LfRow>('SELECT * FROM lost_found_requests ORDER BY created_at DESC').filter((r) => {
    const d = toLocal(r.created_at).date;
    if (q.date === 'today' && d !== today) return false;
    if (q.date === 'yesterday' && d !== addDays(today, -1)) return false;
    if (q.status && r.status !== q.status) return false;
    if (q.campus && r.campus_id !== q.campus) return false;
    return true;
  });
  const counts = { today: db().all<LfRow>('SELECT created_at FROM lost_found_requests').filter((r) => toLocal(r.created_at).date === today).length, yesterday: db().all<LfRow>('SELECT created_at FROM lost_found_requests').filter((r) => toLocal(r.created_at).date === addDays(today, -1)).length, all: db().count('lost_found_requests'), open: db().count('lost_found_requests', "status IN ('reported','searching','found','ready_for_collection')") };
  ok(res, { items: rows.map((r) => fullView(r, u)), counts, today });
}));

lostFoundRouter.get('/security/lost-found/:id', h((req, res) => {
  const u = requireRole(req, 'security');
  const r = getReq(req.params.id as string);
  ok(res, { ...fullView(r, u), suggested_found_items: db().all("SELECT * FROM found_items WHERE status = 'held' AND campus_id = ? AND category = ? ORDER BY found_date DESC", r.campus_id, r.category) });
}));

lostFoundRouter.post('/security/lost-found/:id/status', h((req, res) => {
  const u = requireRole(req, 'security');
  const r = getReq(req.params.id as string);
  const body = parse(z.object({ status: z.enum(['searching', 'reported']), note: z.string().max(400).optional() }), req.body);
  if (['collected', 'closed'].includes(r.status)) throw conflict(`Request is ${r.status}`);
  const now = nowIso();
  db().tx(() => {
    db().update('lost_found_requests', r.id, { status: body.status, updated_at: now, timeline: pushTimeline(r.timeline, { at: now, status: body.status, by: u.id, note: body.note ?? (body.status === 'searching' ? 'Security is searching for the item.' : undefined) }) });
    notify(r.owner_id, { module: 'campus', kind: 'lost_found_status', title: `Update on ${r.public_id}: ${body.status === 'searching' ? 'security is searching' : 'status changed'}`, body: body.note ?? `Your report "${r.item}" is now ${body.status}.`, link: `/campus/lost-found/${r.id}` });
    audit(u.id, 'lost_found.status', 'lost_found_request', r.id, { status: body.status });
  });
  ok(res, fullView(getReq(r.id), u));
}));

lostFoundRouter.post('/security/lost-found/:id/found', h((req, res) => {
  const u = requireRole(req, 'security');
  const r = getReq(req.params.id as string);
  const body = parse(z.object({ collection_location_id: z.string().min(1), note: z.string().max(400).optional(), found_item_id: z.string().optional() }), req.body);
  if (['collected', 'closed'].includes(r.status)) throw conflict(`Request is already ${r.status}`);
  const loc = getLocation(body.collection_location_id);
  if (!loc) throw bad('Collection location is required and must be a known campus place');
  if (!COLLECTION_KINDS.includes(loc.kind)) throw bad('Collection location must be a security desk, service counter or building');
  const owner = userBrief(r.owner_id)!;
  const now = nowIso();
  const result = db().tx(() => {
    const email = sendEmail({
      toUserId: r.owner_id, toAddress: r.contact_email, module: 'campus',
      subject: `Your item has been found – ${r.public_id}`,
      html: foundEmailHtml({ name: owner.name_en, item: r.item, publicId: r.public_id, location: loc.name_en, note: body.note, description: r.description }),
      text: foundEmailText({ name: owner.name_en, item: r.item, publicId: r.public_id, location: loc.name_en, note: body.note })
    });
    let tl = pushTimeline(r.timeline, { at: now, status: 'found', by: u.id, note: body.note ?? 'Item found by security.' });
    tl = pushTimeline(tl, { at: now, status: 'ready_for_collection', by: u.id, note: `Ready for collection at ${loc.name_en}. Owner notified.`, email_id: email.id, collection_location_id: loc.id });
    db().update('lost_found_requests', r.id, { status: 'ready_for_collection', found_at: now, found_by: u.id, collection_location_id: loc.id, collection_note: body.note ?? null, updated_at: now, timeline: tl });
    if (body.found_item_id) db().run("UPDATE found_items SET matched_request_id = ?, status = 'matched' WHERE id = ?", r.id, body.found_item_id);
    // Owner-only notification (never broadcast).
    notify(r.owner_id, { module: 'campus', kind: 'lost_found_found', title: `Your item has been found: ${r.item}`, body: `Collect it from ${loc.name_en}. Bring your student ID and request ID ${r.public_id}.`, link: `/campus/lost-found/${r.id}` });
    audit(u.id, 'lost_found.found', 'lost_found_request', r.id, { collection_location_id: loc.id, email_id: email.id });
    return email;
  });
  ok(res, { ...fullView(getReq(r.id), u), email: result });
}));

lostFoundRouter.post('/security/lost-found/:id/handover', h((req, res) => {
  const u = requireRole(req, 'security');
  const r = getReq(req.params.id as string);
  const body = parse(z.object({ verified_by: z.enum(['student_id_card', 'request_id_and_id']), receiver_name_confirmed: z.literal(true), note: z.string().max(400).optional() }), req.body);
  if (!['found', 'ready_for_collection'].includes(r.status)) throw conflict(`Handover requires the item to be found and ready for collection (current status: ${r.status})`);
  const now = nowIso();
  const owner = userBrief(r.owner_id)!;
  const handover = { at: now, by: u.id, verified_by: body.verified_by, receiver_name_confirmed: true, receiver: owner.name_en, note: body.note ?? null };
  db().tx(() => {
    db().update('lost_found_requests', r.id, { status: 'collected', handover: JSON.stringify(handover), updated_at: now, timeline: pushTimeline(r.timeline, { at: now, status: 'collected', by: u.id, note: `Handed over to ${owner.name_en} (verified by ${body.verified_by.replace(/_/g, ' ')}).` }) });
    db().run("UPDATE found_items SET status = 'returned' WHERE matched_request_id = ?", r.id);
    notify(r.owner_id, { module: 'campus', kind: 'lost_found_collected', title: `Collected: ${r.item}`, body: `Handover recorded at the security desk. Request ${r.public_id} is complete.`, link: `/campus/lost-found/${r.id}` });
    audit(u.id, 'lost_found.handover', 'lost_found_request', r.id, handover);
  });
  ok(res, fullView(getReq(r.id), u));
}));

lostFoundRouter.post('/security/lost-found/:id/close', h((req, res) => {
  const u = requireRole(req, 'security');
  const r = getReq(req.params.id as string);
  const body = parse(z.object({ note: z.string().max(400).optional() }), req.body ?? {});
  if (r.status === 'closed') throw conflict('Request is already closed');
  const now = nowIso();
  db().tx(() => {
    db().update('lost_found_requests', r.id, { status: 'closed', updated_at: now, timeline: pushTimeline(r.timeline, { at: now, status: 'closed', by: u.id, note: body.note ?? (r.status === 'collected' ? 'Closed after collection.' : 'Closed by security.') }) });
    notify(r.owner_id, { module: 'campus', kind: 'lost_found_closed', title: `Closed: ${r.public_id}`, body: body.note ?? `Your report "${r.item}" was closed by security.`, link: `/campus/lost-found/${r.id}` });
    audit(u.id, 'lost_found.close', 'lost_found_request', r.id, {});
  });
  ok(res, fullView(getReq(r.id), u));
}));

// ------------------------------------------------------------------ found items (security log)
lostFoundRouter.get('/security/found-items', h((req, res) => {
  requireRole(req, 'security');
  const rows = db().all('SELECT * FROM found_items ORDER BY found_date DESC, created_at DESC').map((fi) => ({
    ...fi,
    found_location: locationSummary(fi.found_location_id as string | null),
    held_at: locationSummary(fi.held_at_location_id as string | null),
    reporter: userBrief(fi.reported_by as string),
    matched_request: fi.matched_request_id ? (() => { const r = db().get<LfRow>('SELECT id, public_id, item, status FROM lost_found_requests WHERE id = ?', fi.matched_request_id as string); return r ? { id: r.id, public_id: r.public_id, item: r.item, status: r.status } : null; })() : null,
    suggested_count: fi.status === 'held' ? suggestedMatches(fi as never).length : 0
  }));
  ok(res, rows);
}));

lostFoundRouter.post('/security/found-items', h((req, res) => {
  const u = requireRole(req, 'security');
  const body = parse(z.object({ item: z.string().min(2).max(120), category: z.enum(LF_CATEGORIES).optional(), description: z.string().max(800).optional(), found_location_id: z.string().nullable().optional(), found_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), held_at_location_id: z.string().nullable().optional(), campus_id: z.enum(['riyadh', 'khobar']).optional() }), req.body);
  const foundLoc = body.found_location_id ? getLocation(body.found_location_id) : null;
  if (body.found_location_id && !foundLoc) throw bad('Unknown found location');
  const heldLoc = body.held_at_location_id ? getLocation(body.held_at_location_id) : null;
  if (body.held_at_location_id && !heldLoc) throw bad('Unknown holding location');
  const campus = body.campus_id ?? foundLoc?.campus_id ?? heldLoc?.campus_id ?? u.campus_id;
  const row = { id: newId('fi'), campus_id: campus, reported_by: u.id, item: body.item.trim(), category: body.category ?? 'other', description: (body.description ?? '').trim(), found_location_id: foundLoc?.id ?? null, found_date: body.found_date ?? todayIso(), held_at_location_id: heldLoc?.id ?? (campus === 'khobar' ? 'khb_security' : 'ryd_security'), matched_request_id: null, status: 'held', created_at: nowIso() };
  db().insert('found_items', row);
  audit(u.id, 'found_item.create', 'found_item', row.id, {});
  ok(res, { ...row, suggested: suggestedMatches(row) }, 201);
}));

lostFoundRouter.get('/security/found-items/:id/matches', h((req, res) => {
  requireRole(req, 'security');
  const fi = db().get('SELECT * FROM found_items WHERE id = ?', req.params.id as string);
  if (!fi) throw notFound('Found item not found');
  ok(res, { found_item: fi, matches: suggestedMatches(fi as never), note: 'Suggestions only – ownership is confirmed at the desk, never automatically.' });
}));

lostFoundRouter.post('/security/found-items/:id/link', h((req, res) => {
  const u = requireRole(req, 'security');
  const fi = db().get('SELECT * FROM found_items WHERE id = ?', req.params.id as string);
  if (!fi) throw notFound('Found item not found');
  const { requestId } = parse(z.object({ requestId: z.string().min(1) }), req.body);
  const r = getReq(requestId);
  if (['collected', 'closed'].includes(r.status)) throw conflict(`Request is ${r.status}`);
  const now = nowIso();
  db().tx(() => {
    db().run("UPDATE found_items SET matched_request_id = ?, status = 'matched' WHERE id = ?", r.id, fi.id as string);
    db().update('lost_found_requests', r.id, { updated_at: now, timeline: pushTimeline(r.timeline, { at: now, status: r.status, by: u.id, note: `Possible match logged by security (found item "${fi.item}"). Ownership still to be verified at the desk.` }) });
    audit(u.id, 'found_item.link', 'found_item', fi.id as string, { request_id: r.id });
  });
  ok(res, { linked: true, request: fullView(getReq(r.id), u) });
}));
