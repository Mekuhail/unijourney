import type { Db } from './db.ts';
import { getSetting, setSetting } from './settings.ts';

/**
 * Additive data migrations for existing databases (e.g. the Fly.io volume).
 *
 * Schema changes are always new tables (`CREATE TABLE IF NOT EXISTS` in schema.sql runs on every start), so no DDL is
 * needed here. A migration only fills those new tables with demo content, once, without touching existing rows, so a
 * deploy never depends on wiping data or bumping SEED_VERSION. A fresh seed already contains the same content and
 * marks every migration as applied.
 */
export interface Migration { id: string; description: string; run: (d: Db) => void }

const registry: Migration[] = [];
const KEY = 'migrations_applied';

export function registerMigration(m: Migration) {
  if (!registry.some((x) => x.id === m.id)) registry.push(m);
}

export function appliedMigrations(): string[] {
  return getSetting<string[]>(KEY, []);
}

/** Called at the end of a full seed: the seed already created what the migrations would add. */
export function markAllMigrationsApplied() {
  setSetting(KEY, registry.map((m) => m.id));
}

/** Runs pending migrations in registration order, each in its own transaction. Returns the ids that ran. */
export function runMigrations(d: Db): string[] {
  const done = new Set(appliedMigrations());
  const ran: string[] = [];
  for (const m of registry) {
    if (done.has(m.id)) continue;
    d.tx(() => {
      m.run(d);
      done.add(m.id);
      setSetting(KEY, [...done]);
    });
    ran.push(m.id);
    console.log(`[migrate] applied ${m.id}: ${m.description}`);
  }
  return ran;
}
