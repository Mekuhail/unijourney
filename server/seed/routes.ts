import { Router } from 'express';
import { config } from '../core/config.ts';
import { forbidden, h, ok } from '../core/http.ts';
import { seedAll } from './index.ts';
import { audit } from '../core/audit.ts';

export const demoRouter = Router();

demoRouter.post('/reset', h((req, res) => {
  if (!config.demoMode) throw forbidden('Reset is only available in demo mode');
  seedAll({ reset: true });
  audit(req.user?.id ?? null, 'demo.reset', 'system', 'seed', {});
  ok(res, { reset: true });
}));
