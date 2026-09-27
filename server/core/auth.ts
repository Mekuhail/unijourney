import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Role, User } from '../../shared/types.ts';
import { can, type Capability } from '../../shared/access.ts';
import { config } from './config.ts';
import { db, pj } from './db.ts';
import { forbidden, unauthorized } from './http.ts';

export const SESSION_COOKIE = 'uj_session';
export const DEFAULT_PERSONA = 'u_student';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

function hmac(v: string): string {
  return createHmac('sha256', config.sessionSecret).update(v).digest('hex');
}

export function signSession(userId: string): string {
  return `${userId}.${hmac(userId)}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = hmac(userId);
  if (sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? userId : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function userFromRow(row: any): User {
  return {
    id: row.id,
    roles: pj<Role[]>(row.roles, ['student']),
    name_en: row.name_en,
    name_ar: row.name_ar,
    email: row.email,
    student_no: row.student_no ?? null,
    program_id: row.program_id ?? null,
    campus_id: row.campus_id,
    stage: row.stage,
    level: row.level,
    locale: row.locale,
    interests: pj<string[]>(row.interests, []),
    skills: pj<string[]>(row.skills, []),
    preferences: pj<Record<string, unknown>>(row.preferences, {}),
    avatar_color: row.avatar_color,
    department: row.department ?? null,
    created_at: row.created_at
  };
}

export function getUser(id: string): User | null {
  const row = db().get('SELECT * FROM users WHERE id = ?', id);
  return row ? userFromRow(row) : null;
}

export function listUsers(): User[] {
  return db().all('SELECT * FROM users ORDER BY created_at').map(userFromRow);
}

export function attachUser(): RequestHandler {
  return (req, res, next) => {
    const token = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? undefined;
    let userId = verifySession(token);
    if (!userId && config.demoMode) {
      // Demo default persona: explicit and visible in the persona switcher.
      userId = DEFAULT_PERSONA;
      res.cookie(SESSION_COOKIE, signSession(userId), { httpOnly: true, sameSite: 'lax', path: '/' });
    }
    if (userId) {
      const u = getUser(userId);
      if (u) req.user = u;
    }
    next();
  };
}

export function requireUser(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function hasRole(user: User, ...roles: Role[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

export function requireRole(req: Request, ...roles: Role[]): User {
  const u = requireUser(req);
  if (!hasRole(u, ...roles)) throw forbidden(`This action requires role: ${roles.join(' or ')}`);
  return u;
}

/** The same role → capability matrix the client uses for navigation; hiding a link is never the authorization. */
export function requireCapability(req: Request, cap: Capability): User {
  const u = requireUser(req);
  if (!can(u.roles, cap)) throw forbidden('This page is not available for your role.');
  return u;
}

/** Path-scoped middleware: `router.use(['/study', '/planner'], gate('study'))`. */
export function gate(cap: Capability): RequestHandler {
  return (req, _res, next) => { requireCapability(req, cap); next(); };
}

/** Owner or one of the given staff roles. */
export function requireOwnerOrRole(req: Request, ownerId: string, ...roles: Role[]): User {
  const u = requireUser(req);
  if (u.id === ownerId) return u;
  if (roles.length && hasRole(u, ...roles)) return u;
  throw forbidden();
}
