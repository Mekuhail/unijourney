import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { db } from '../server/core/db.ts';
import { createDocumentFromBuffer } from '../server/core/documents.ts';
import { registeredMigrations, runMigrations } from '../server/core/migrations.ts';
import { SESSION_COOKIE, signSession } from '../server/core/auth.ts';
import { setSetting } from '../server/core/settings.ts';

interface Img { url: string; width: number; height: number; alt_en: string; credit_en: string | null }
interface Post { id: string; body: string; gallery: Img[]; source: { url: string; happened_on: string | null; highlight: number } | null; event: { id: string } | null }

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

describe('club post media', () => {
  it('seeds past highlights with a source, a date and an illustration with alt text and credit', async () => {
    const r = await s.as('u_student').get<{ items: Post[]; pinned: Post[] }>('/campus/clubs/club_gdg/posts');
    const all = [...r.body.data!.pinned, ...r.body.data!.items];
    const pt = all.find((p) => p.id === 'cpost_hl_packet_tracer')!;
    expect(pt.source).toMatchObject({ highlight: 1, happened_on: '2026-03-15' });
    expect(pt.source!.url).toMatch(/^https:\/\/gdg\.community\.dev\//);
    expect(pt.gallery[0]).toMatchObject({ url: '/community/gdg-packet-tracer.svg', width: 1200, height: 675 });
    expect(pt.gallery[0].alt_en.length).toBeGreaterThan(10);
    expect(pt.gallery[0].credit_en).toMatch(/not a photo/);
    // Past events are never presented as upcoming: highlights carry no event link.
    expect(pt.event).toBeNull();
    const demo = all.find((p) => p.id === 'cpost_demo_openlab')!;
    expect(demo.source).toBeNull();
    expect(demo.event?.id).toBe('evt_gdg_openlab');
  });

  it('lets a club lead attach uploaded photos with alt text, and refuses someone else’s file', async () => {
    const mine = createDocumentFromBuffer('u_lead', 'post_media', 'photo.png', 'image/png', PNG);
    const theirs = createDocumentFromBuffer('u_student', 'post_media', 'other.png', 'image/png', PNG);
    const bad = await s.as('u_lead').post('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Photos from tonight', media: [{ document_id: theirs.id, alt: 'Members at the lab', width: 1, height: 1 }] });
    expect(bad.status).toBe(422);
    const noAlt = await s.as('u_lead').post('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Photos from tonight', media: [{ document_id: mine.id, alt: '', width: 1, height: 1 }] });
    expect(noAlt.status).toBe(400);
    const ok = await s.as('u_lead').post<Post>('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Photos from tonight', media: [{ document_id: mine.id, alt: 'Members around a laptop at the open lab', width: 1600, height: 900 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.gallery[0]).toMatchObject({ url: `/api/documents/${mine.id}/file`, width: 1600, height: 900 });
    // Anyone who can see the post can load the image; the same file cannot be attached twice.
    const img = await fetch(`${s.url}/api/documents/${mine.id}/file`, { headers: { cookie: `${SESSION_COOKIE}=${signSession('u_student2')}` } });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect((await s.as('u_lead').post('/campus/clubs/club_gdg/posts', { kind: 'announcement', body: 'Again', media: [{ document_id: mine.id, alt: 'Same photo again', width: 1, height: 1 }] })).status).toBe(409);
  });

  it('adds the media to an existing database once, through a migration', () => {
    db().exec("DELETE FROM club_posts WHERE id LIKE 'cpost_hl_%' OR id = 'cpost_demo_openlab'");
    setSetting('migrations_applied', registeredMigrations().filter((id) => id !== 'club-media-v1'));
    expect(runMigrations(db())).toEqual(['club-media-v1']);
    expect(db().count('club_post_sources')).toBe(4);
    expect(db().count('club_post_media', "asset_path IS NOT NULL")).toBe(5);
    expect(runMigrations(db())).toEqual([]);
  });
});
