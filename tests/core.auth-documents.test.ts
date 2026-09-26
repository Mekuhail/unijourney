import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshDb, startServer, type TestServer } from './helpers.ts';
import { makePdf, makePng } from '../server/seed/fixtures.ts';
import { SESSION_COOKIE, signSession } from '../server/core/auth.ts';

let s: TestServer;
beforeAll(async () => { freshDb(); s = await startServer(); });
afterAll(async () => { await s.close(); });

async function upload(userId: string, name: string, mime: string, buf: Buffer, kind = 'medical') {
  const fd = new FormData();
  fd.set('kind', kind);
  fd.set('file', new Blob([new Uint8Array(buf)], { type: mime }), name);
  const res = await fetch(`${s.url}/api/documents`, { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${signSession(userId)}` }, body: fd });
  return { status: res.status, body: (await res.json()) as { data?: { id: string }; error?: unknown } };
}

describe('session, roles and private documents', () => {
  it('defaults to the demo student persona without a cookie and switches personas explicitly', async () => {
    const r = await fetch(`${s.url}/api/session/me`);
    const j = (await r.json()) as { data: { user: { id: string } } };
    expect(j.data.user.id).toBe('u_student');
    const sw = await s.as('u_student').post('/session/switch', { personaId: 'u_reviewer' });
    expect(sw.status).toBe(200);
    expect((sw.body.data as { user: { roles: string[] } }).user.roles).toContain('reviewer');
    const bad = await s.as('u_student').post('/session/switch', { personaId: 'nobody' });
    expect(bad.status).toBe(404);
  });

  it('validates uploads by magic bytes and rejects executables', async () => {
    const pdf = await upload('u_student', 'report.pdf', 'application/pdf', makePdf(['Sick leave from 21/09/2026 to 22/09/2026']));
    expect(pdf.status).toBe(201);
    const fake = await upload('u_student', 'report.pdf', 'application/pdf', Buffer.from('not a pdf at all'));
    expect(fake.status).toBe(400);
    const exe = await upload('u_student', 'virus.exe', 'image/png', makePng());
    expect(exe.status).toBe(400);
    const png = await upload('u_student', 'photo.png', 'image/png', makePng(), 'lost_item');
    expect(png.status).toBe(201);
  });

  it('only the owner can read a document; other students and unrelated staff get 403', async () => {
    const up = await upload('u_student', 'evidence.pdf', 'application/pdf', makePdf(['x']));
    const id = up.body.data!.id;
    expect((await s.as('u_student').get(`/documents/${id}`)).status).toBe(200);
    expect((await s.as('u_lead').get(`/documents/${id}`)).status).toBe(403);
    expect((await s.as('u_security').get(`/documents/${id}`)).status).toBe(403);
    const file = await fetch(`${s.url}/api/documents/${id}/file`, { headers: { cookie: `${SESSION_COOKIE}=${signSession('u_lead')}` } });
    expect(file.status).toBe(403);
    const own = await fetch(`${s.url}/api/documents/${id}/file`, { headers: { cookie: `${SESSION_COOKIE}=${signSession('u_student')}` } });
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toContain('application/pdf');
  });

  it('exposes policies with provenance and the demo status honestly labels adapters', async () => {
    const p = await s.as('u_student').get<Record<string, { value: unknown; provenance: string }>>('/policies');
    expect(p.body.data!.creditLimit.provenance.length).toBeGreaterThan(10);
    const st = await s.as('u_student').get<{ adapters: Array<{ real: boolean; name: string }> }>('/demo/status');
    const portal = st.body.data!.adapters.find((a) => a.name.startsWith('UniversityPortalAdapter'));
    expect(portal?.real).toBe(false);
  });

  it('reset rebuilds fixtures (demo mode only)', async () => {
    const r = await s.as('u_student').post('/demo/reset');
    expect(r.status).toBe(200);
    const me = await s.as('u_student').get<{ user: { id: string } }>('/session/me');
    expect(me.body.data!.user.id).toBe('u_student');
  });
});
