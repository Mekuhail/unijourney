import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { coreRouter } from './core/routes.ts';
import { attachUser } from './core/auth.ts';
import { errorMiddleware } from './core/http.ts';
import { modules } from './modules/index.ts';
import { config, ROOT } from './core/config.ts';
import { demoRouter } from './seed/routes.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'ok', demoMode: config.demoMode } }));
  app.use('/api', coreRouter);
  app.use('/api/demo', attachUser(), demoRouter);
  for (const m of modules) app.use(`/api/${m.name}`, attachUser(), m.router);

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Unknown API route' } });
  });

  const dist = path.join(ROOT, 'dist', 'client');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorMiddleware);
  return app;
}
