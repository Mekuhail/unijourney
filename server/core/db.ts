import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export type SqlValue = string | number | bigint | null | Uint8Array;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

function norm(p: unknown): SqlValue {
  if (p === undefined || p === null) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (typeof p === 'number' || typeof p === 'string' || typeof p === 'bigint') return p;
  if (p instanceof Uint8Array) return p;
  if (p instanceof Date) return p.toISOString();
  return JSON.stringify(p);
}

export class Db {
  private depth = 0;
  constructor(public readonly raw: DatabaseSync, public readonly file: string) {}

  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.raw.prepare(sql).all(...params.map(norm)) as T[];
  }
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.raw.prepare(sql).get(...params.map(norm)) as T | undefined;
  }
  run(sql: string, ...params: unknown[]) {
    return this.raw.prepare(sql).run(...params.map(norm));
  }
  exec(sql: string) {
    this.raw.exec(sql);
  }
  /** Immediate transaction. Nested calls join the outer transaction. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try {
        return fn();
      } finally {
        this.depth--;
      }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const r = fn();
      this.raw.exec('COMMIT');
      return r;
    } catch (e) {
      try {
        this.raw.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      this.depth = 0;
    }
  }
  insert(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => row[k]));
  }
  /** Inserts unless a row with the same key exists (used by additive, idempotent migrations). */
  insertOrIgnore(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => row[k]));
  }
  upsert(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => row[k]));
  }
  update(table: string, id: string, patch: Record<string, unknown>, idCol = 'id') {
    const keys = Object.keys(patch);
    if (!keys.length) return { changes: 0 };
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`;
    return this.run(sql, ...keys.map((k) => patch[k]), id);
  }
  count(table: string, where = '1=1', ...params: unknown[]): number {
    const r = this.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, ...params);
    return Number(r?.c ?? 0);
  }
}

export const j = (v: unknown): string => JSON.stringify(v ?? null);
export function pj<T>(s: unknown, fallback: T): T {
  if (s === null || s === undefined) return fallback;
  if (typeof s !== 'string') return s as T;
  try {
    const v = JSON.parse(s) as T;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

let instance: Db | null = null;

export function schemaSql(): string {
  return fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
}

export function initDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  raw.exec(schemaSql());
  instance = new Db(raw, file);
  return instance;
}

export function db(): Db {
  if (!instance) throw new Error('Database not initialised. Call initDb() first.');
  return instance;
}

export function closeDb() {
  if (instance) {
    instance.raw.close();
    instance = null;
  }
}

/** Drops all rows from every table (keeps schema). Used by demo reset. */
export function truncateAll(d: Db) {
  const tables = d.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  d.exec('PRAGMA foreign_keys = OFF');
  d.tx(() => {
    for (const t of tables) d.exec(`DELETE FROM ${t.name}`);
  });
  d.exec('PRAGMA foreign_keys = ON');
}
