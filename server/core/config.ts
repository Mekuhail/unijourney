import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const ROOT = process.cwd();

// Local secrets live in a gitignored .env at the repo root (production uses platform secrets, e.g. `flyctl secrets set`).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const isProd = process.env.NODE_ENV === 'production';
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
if (isProd && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters in production');
}
const demoControlToken = process.env.DEMO_CONTROL_TOKEN?.trim() ?? '';
if (demoControlToken && demoControlToken.length < 32) {
  throw new Error('DEMO_CONTROL_TOKEN must be at least 32 characters');
}

export const config = {
  port: Number(env('API_PORT', '8787')),
  dataDir: path.resolve(ROOT, env('DATA_DIR', './data')),
  // Local sessions are ephemeral unless the developer supplies a secret.
  sessionSecret: configuredSessionSecret || randomBytes(32).toString('hex'),
  demoControlToken,
  demoMode: env('DEMO_MODE', 'true') !== 'false',
  demoClock: env('DEMO_CLOCK', '2026-09-27T09:00:00+03:00'),
  anthropicKey: env('ANTHROPIC_API_KEY', ''),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
  googleMapsKey: env('GOOGLE_MAPS_API_KEY', ''),
  /** CARTO Basemaps raster key. Browser-visible by design (it goes on tile URLs); restrict it by referrer in the CARTO dashboard. */
  cartoKey: env('CARTO_API_KEY', ''),
  isProd
};

export function ensureDataDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
}

export function dbFile(): string {
  return path.join(config.dataDir, 'unijourney.db');
}
