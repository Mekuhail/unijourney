import { Router } from 'express';
import { h, ok } from '../core/http.ts';
import { seedAll } from './index.ts';
import { audit } from '../core/audit.ts';
import { requireDemoControl } from './control-auth.ts';

export const demoRouter = Router();

demoRouter.post('/reset', h((req, res) => {
  requireDemoControl(req);
  seedAll({ reset: true });
  audit(req.user?.id ?? null, 'demo.reset', 'system', 'seed', {});
  ok(res, { reset: true });
}));
