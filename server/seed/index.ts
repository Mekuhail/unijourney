import { db, truncateAll } from '../core/db.ts';
import { clearUploads } from '../core/documents.ts';
import { getSetting, setSetting, CURRENT_TERM, NEXT_TERM } from '../core/settings.ts';
import { nowIso, setClockOverride, todayIso } from '../core/clock.ts';
import { config } from '../core/config.ts';
import { modules } from '../modules/index.ts';
import { markAllMigrationsApplied } from '../core/migrations.ts';
import { seedCore } from './core.ts';
import type { SeedContext } from './context.ts';

/** Bump when fixtures change so existing databases (e.g. the Fly.io volume) are rebuilt on the next start. */
export const SEED_VERSION = '2026-09-26.community-feedback-v7';

/** Seeds synthetic demo fixtures. Returns true when seeding ran. */
export function seedAll(opts: { reset: boolean }): boolean {
  const d = db();
  if (opts.reset) {
    truncateAll(d);
    clearUploads();
    setClockOverride(config.demoMode ? config.demoClock : null);
  } else if (d.count('users') > 0) {
    if (getSetting<string | null>('seed_version', null) === SEED_VERSION) return false;
    console.log(`[seed] fixtures changed (${getSetting<string | null>('seed_version', null) ?? 'none'} -> ${SEED_VERSION}); rebuilding demo data`);
    truncateAll(d);
    clearUploads();
  }
  if (!getSetting<string | null>('demo_clock', null) && config.demoMode) setClockOverride(config.demoClock);
  d.tx(() => {
    const users = seedCore(d);
    const ctx: SeedContext = { db: d, users, today: todayIso(), term: CURRENT_TERM, nextTerm: NEXT_TERM };
    for (const m of modules) m.seed?.(ctx);
    setSetting('seeded_at', nowIso());
    setSetting('seed_version', SEED_VERSION);
    markAllMigrationsApplied();
    setSetting('demo_clock', config.demoMode ? config.demoClock : null);
  });
  return true;
}
