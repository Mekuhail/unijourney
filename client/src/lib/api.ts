import type { ApiResponse } from '@shared/types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`/api${path}${qs(opts.query)}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    signal: opts.signal
  });
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, 'bad_response', `Server returned ${res.status}`);
  }
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data;
}

export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', body: fd, credentials: 'include' });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length && typeof e.details[0] === 'object' && e.details[0] && 'message' in (e.details[0] as object)) {
      return `${e.message}: ${(e.details as Array<{ path: string; message: string }>).map((d) => `${d.path ? d.path + ' ' : ''}${d.message}`).join('; ')}`;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
