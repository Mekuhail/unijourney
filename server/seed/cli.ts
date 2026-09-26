process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/.test(w.message)) return;
  console.warn(w);
});
import { ensureDataDirs, dbFile } from '../core/config.ts';
import { initDb } from '../core/db.ts';
import { seedAll } from './index.ts';

ensureDataDirs();
initDb(dbFile());
const reset = process.argv.includes('--reset');
const did = seedAll({ reset });
console.log(did ? `Seeded demo data into ${dbFile()}` : 'Database already seeded (use --reset to rebuild).');
