// Suppress the node:sqlite experimental warning (stable enough for the prototype; Node >= 22.13 required).
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/.test(w.message)) return;
  console.warn(w);
});

import { config, ensureDataDirs, dbFile } from './core/config.ts';
import { initDb, db } from './core/db.ts';
import { runMigrations } from './core/migrations.ts';
import { seedAll } from './seed/index.ts';
import { createApp } from './app.ts';
import { setClockOverride } from './core/clock.ts';
import { getSetting } from './core/settings.ts';

const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`UniJourney needs Node.js 22.13 or newer (node:sqlite). Current: ${process.versions.node}`);
  process.exit(1);
}

ensureDataDirs();
initDb(dbFile());
const seeded = seedAll({ reset: false });
const storedClock = getSetting<string | null>('demo_clock', null);
setClockOverride(storedClock ?? (config.demoMode ? config.demoClock : null));
// Additive data for existing volumes (new tables only); a fresh seed marks these as applied.
runMigrations(db());

const app = createApp();
app.listen(config.port, () => {
  console.log(`UniJourney API listening on http://localhost:${config.port} (demo mode: ${config.demoMode}, seeded: ${seeded ? 'fresh' : 'existing'})`);
});
