import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { createDocumentFromBuffer } from '../server/core/documents.ts';
import { makePng } from '../server/seed/fixtures.ts';

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

interface Lf { id: string; public_id: string; status: string; item?: string; description?: string; contact_email?: string; owner?: unknown; collection_location?: { id: string } | null; email_id?: string | null; timeline: Array<{ status: string; email_id?: string }>; document?: { id: string } | null; handover?: unknown }

describe('YU Claimed lost & found', () => {
  let created: Lf;

  it('create → opaque public id (YU-XXXX-XXXXX), owner-bound, optional owned photo', async () => {
    const sara = s.as('u_student');
    const photo = createDocumentFromBuffer('u_student', 'lost_item', 'keys.png', 'image/png', makePng(32, 32));
    const foreign = createDocumentFromBuffer('u_lead', 'lost_item', 'x.png', 'image/png', makePng(8, 8));
    expect((await sara.post('/campus/lost-found', { item: 'Car keys', category: 'keys', lost_date: '2026-09-26', last_location_id: 'ryd_cafeteria', documentId: foreign.id })).status).toBe(403);
    expect((await sara.post('/campus/lost-found', { item: 'Car keys', category: 'keys', lost_date: '2026-09-26' })).status).toBe(400); // no place given
    const r = await sara.post<Lf>('/campus/lost-found', { item: 'Car keys with a blue tag', category: 'keys', lost_date: '2026-09-26', last_location_id: 'ryd_cafeteria', description: 'Toyota key with a blue tag', documentId: photo.id });
    expect(r.status).toBe(201);
    created = r.body.data!;
    expect(created.public_id).toMatch(/^YU-[A-Z2-9]{4}-[A-Z2-9]{5}$/);
    expect(created.status).toBe('reported');
    expect(created.contact_email).toBe('sara.demo@student.yu-demo.invalid');
    expect(created.document?.id).toBe(photo.id);
    expect(db().count('notifications', "user_id = 'u_security' AND kind = 'lost_found_new'")).toBeGreaterThanOrEqual(1);
  });

  it('status by public id: owner and security see details, another student only sees the status', async () => {
    const owner = await s.as('u_student').get<Lf>(`/campus/lost-found/status/${created.public_id}`);
    expect(owner.status).toBe(200);
    expect(owner.body.data!.item).toBe('Car keys with a blue tag');
    const other = await s.as('u_student2').get<Record<string, unknown>>(`/campus/lost-found/status/${created.public_id.toLowerCase()}`);
    expect(other.status).toBe(200);
    expect(other.body.data!.status).toBe('reported');
    expect(other.body.data!.restricted).toBe(true);
    expect(other.body.data!.item).toBeUndefined();
    expect(other.body.data!.description).toBeUndefined();
    expect(other.body.data!.contact_email).toBeUndefined();
    expect(other.body.data!.owner).toBeUndefined();
    const sec = await s.as('u_security').get<Lf>(`/campus/lost-found/status/${created.public_id}`);
    expect(sec.body.data!.item).toBe('Car keys with a blue tag');
    expect((await s.as('u_student2').get(`/campus/lost-found/${created.id}`)).status).toBe(403);
    expect((await s.as('u_student').get('/campus/lost-found/status/YU-ZZZZ-ZZZZZ')).status).toBe(404);
  });

  it('security can open the attached photo through the document grant; a club lead cannot', async () => {
    expect((await s.as('u_security').get(`/documents/${created.document!.id}`)).status).toBe(200);
    expect((await s.as('u_lead').get(`/documents/${created.document!.id}`)).status).toBe(403);
  });

  it('mark found requires a collection location, notifies only the owner and writes a branded email', async () => {
    const sec = s.as('u_security');
    expect((await sec.post(`/campus/security/lost-found/${created.id}/found`, {})).status).toBe(400);
    expect((await sec.post(`/campus/security/lost-found/${created.id}/found`, { collection_location_id: 'ryd_room_b204' })).status).toBe(400); // rooms are not collection points
    const notifBefore = db().count('notifications');
    const emailsBefore = db().count('email_outbox');
    const r = await sec.post<Lf & { email: { id: string; status: string } }>(`/campus/security/lost-found/${created.id}/found`, { collection_location_id: 'ryd_security', note: 'Ask for the box at the desk' });
    expect(r.status).toBe(200);
    expect(r.body.data!.status).toBe('ready_for_collection');
    expect(r.body.data!.collection_location?.id).toBe('ryd_security');
    expect(r.body.data!.email.status).toBe('simulated');
    expect(r.body.data!.email_id).toBe(r.body.data!.email.id);
    expect(r.body.data!.timeline.map((t) => t.status)).toEqual(['reported', 'found', 'ready_for_collection']);
    // exactly one notification, to the owner only
    const newNotifs = db().all('SELECT user_id, link FROM notifications ORDER BY rowid DESC LIMIT ?', db().count('notifications') - notifBefore);
    expect(newNotifs.length).toBe(1);
    expect(newNotifs[0].user_id).toBe('u_student');
    expect(newNotifs[0].link).toBe(`/campus/lost-found/${created.id}`);
    expect(db().count('email_outbox') - emailsBefore).toBe(1);
    const email = db().get('SELECT * FROM email_outbox WHERE id = ?', r.body.data!.email.id)!;
    expect(email.to_user_id).toBe('u_student');
    expect(email.to_address).toBe('sara.demo@student.yu-demo.invalid');
    expect(email.status).toBe('simulated');
    for (const needle of ['Great news', 'Item details', 'Request ID', 'Collection point', 'Collection instructions', 'student ID', 'Security Office', created.public_id]) expect(String(email.html)).toContain(needle);
    // the owner can read the email preview; another student cannot
    expect((await s.as('u_student').get(`/emails/${email.id}`)).status).toBe(200);
    expect((await s.as('u_student2').get(`/emails/${email.id}`)).status).toBe(403);
  });

  it('handover is required before collected; close afterwards', async () => {
    const sec = s.as('u_security');
    // a fresh request cannot be handed over
    expect((await sec.post('/campus/security/lost-found/lf_sara_backpack/handover', { verified_by: 'student_id_card', receiver_name_confirmed: true })).status).toBe(409);
    // receiver confirmation is mandatory
    expect((await sec.post(`/campus/security/lost-found/${created.id}/handover`, { verified_by: 'student_id_card', receiver_name_confirmed: false })).status).toBe(400);
    const h = await sec.post<Lf>(`/campus/security/lost-found/${created.id}/handover`, { verified_by: 'request_id_and_id', receiver_name_confirmed: true });
    expect(h.status).toBe(200);
    expect(h.body.data!.status).toBe('collected');
    expect((h.body.data!.handover as { verified_by: string }).verified_by).toBe('request_id_and_id');
    expect((await sec.post(`/campus/security/lost-found/${created.id}/found`, { collection_location_id: 'ryd_security' })).status).toBe(409);
    const c = await sec.post<Lf>(`/campus/security/lost-found/${created.id}/close`, {});
    expect(c.body.data!.status).toBe('closed');
    expect((await sec.post(`/campus/security/lost-found/${created.id}/close`, {})).status).toBe(409);
  });

  it('security desk lists by day and found items suggest matches without auto-linking', async () => {
    const sec = s.as('u_security');
    const today = await sec.get<{ items: Lf[]; counts: { today: number } }>('/campus/security/lost-found?date=today');
    expect(today.status).toBe(200);
    expect(today.body.data!.items.some((r) => r.id === 'lf_sara_backpack')).toBe(true);
    const yesterday = await sec.get<{ items: Lf[] }>('/campus/security/lost-found?date=yesterday');
    expect(yesterday.body.data!.items.some((r) => r.id === 'lf_layan_earbuds')).toBe(true);
    const m = await sec.get<{ matches: Array<{ request_id: string; score: number; reasons: string[] }> }>('/campus/security/found-items/fi_backpack/matches');
    expect(m.body.data!.matches[0]?.request_id).toBe('lf_sara_backpack');
    expect(db().get('SELECT status FROM lost_found_requests WHERE id = ?', 'lf_sara_backpack')!.status).toBe('reported'); // suggestion only
    const link = await sec.post<{ linked: boolean; request: Lf }>('/campus/security/found-items/fi_backpack/link', { requestId: 'lf_sara_backpack' });
    expect(link.status).toBe(200);
    expect(link.body.data!.request.status).toBe('reported'); // still not "found" until security marks it
    expect(db().get('SELECT matched_request_id FROM found_items WHERE id = ?', 'fi_backpack')!.matched_request_id).toBe('lf_sara_backpack');
    // students never see the security desk
    expect((await s.as('u_student').get('/campus/security/lost-found')).status).toBe(403);
  });
});
