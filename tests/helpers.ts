import { initDb, closeDb } from '../server/core/db.ts';
import { seedAll } from '../server/seed/index.ts';
import { setClockOverride } from '../server/core/clock.ts';
import { createApp } from '../server/app.ts';
import { signSession, SESSION_COOKIE } from '../server/core/auth.ts';
import type { Server } from 'node:http';

process.on('warning', (w) => { if (w.name === 'ExperimentalWarning') return; console.warn(w); });
// DATA_DIR for tests is set in vitest.config.ts (test.env) so it applies before any import.

export function freshDb() {
  closeDb();
  initDb(':memory:');
  setClockOverride('2026-09-27T09:00:00+03:00');
  seedAll({ reset: true });
}

export interface TestServer { url: string; close: () => Promise<void>; as: (userId: string) => Client }
export interface Client {
  get<T = unknown>(path: string): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }>;
  post<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }>;
  put<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }>;
  patch<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }>;
  del<T = unknown>(path: string): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } }>;
}

export async function startServer(): Promise<TestServer> {
  const app = createApp();
  const server: Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;
  const as = (userId: string): Client => {
    const cookie = `${SESSION_COOKIE}=${signSession(userId)}`;
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${url}/api${path}`, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json() };
    };
    return {
      get: (p) => call('GET', p) as never,
      post: (p, b) => call('POST', p, b ?? {}) as never,
      put: (p, b) => call('PUT', p, b ?? {}) as never,
      patch: (p, b) => call('PATCH', p, b ?? {}) as never,
      del: (p) => call('DELETE', p) as never
    };
  };
  return { url, as, close: () => new Promise((r) => server.close(() => r())) };
}
