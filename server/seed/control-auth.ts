import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../core/config.ts';
import { forbidden } from '../core/http.ts';

/** Shared demo mutations require a separate operator token, never a switchable persona. */
export function requireDemoControl(req: Request): void {
  if (!config.demoMode || !config.demoControlToken) throw forbidden('Demo controls are disabled');
  const supplied = req.get('x-demo-control-token') ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(config.demoControlToken))) {
    throw forbidden('Demo operator token required');
  }
}
