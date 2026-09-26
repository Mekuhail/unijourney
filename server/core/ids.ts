import { randomBytes, createHash } from 'node:crypto';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PUB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

export function newId(prefix: string, len = 10): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length];
  return `${prefix}_${s}`;
}

/** Opaque public reference such as YU-K7QX-3NM2P (used for lost & found and receipts). */
export function publicRef(prefix = 'YU'): string {
  const b = randomBytes(9);
  const part = (from: number, n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += PUB[b[from + i] % PUB.length];
    return s;
  };
  return `${prefix}-${part(0, 4)}-${part(4, 5)}`;
}

/** Stable hash of a JSON-serialisable payload (keys sorted). */
export function stableHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
