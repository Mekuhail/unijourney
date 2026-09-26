import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const bad = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Sign in required') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this record') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);
export const gone = (message: string, details?: unknown) => new HttpError(410, 'gone', message, details);
export const unprocessable = (message: string, details?: unknown) => new HttpError(422, 'unprocessable', message, details);

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function h(fn: (req: Request, res: Response, next: NextFunction) => any): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw bad(
      'Validation failed',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }
  return r.data;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // multer and body-parser errors
  const e = err as { status?: number; message?: string; code?: string };
  if (e && typeof e.status === 'number' && e.status < 500) {
    res.status(e.status).json({ ok: false, error: { code: e.code ?? 'bad_request', message: e.message ?? 'Bad request' } });
    return;
  }
  console.error('[unijourney] unhandled error', err);
  res.status(500).json({ ok: false, error: { code: 'internal', message: 'Unexpected server error' } });
}
