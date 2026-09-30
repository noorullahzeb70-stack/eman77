// Consistent API responses and error type.
//   success → { "success": true,  "data": {...} }
//   failure → { "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable" } }
import type { IncomingMessage, ServerResponse } from 'node:http';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const Errors = {
  badRequest: (msg = 'The request is invalid.', details?: Record<string, string>) => new AppError(400, 'BAD_REQUEST', msg, details),
  validation: (details: Record<string, string>, msg = 'Please check the highlighted fields.') => new AppError(422, 'VALIDATION_ERROR', msg, details),
  unauthorized: (msg = 'Please sign in to continue.') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'You do not have permission to do that.') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Not found.') => new AppError(404, 'NOT_FOUND', msg),
  conflict: (msg: string) => new AppError(409, 'CONFLICT', msg),
  tooLarge: (msg = 'The file or request is too large.') => new AppError(413, 'PAYLOAD_TOO_LARGE', msg),
  unsupported: (msg = 'This file type is not supported.') => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', msg),
  rateLimited: (msg = 'Too many requests. Please slow down and try again shortly.', retryAfter?: number) => {
    const e = new AppError(429, 'RATE_LIMITED', msg);
    if (retryAfter) e.details = { retryAfter: String(retryAfter) };
    return e;
  },
  internal: () => new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.'),
};

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export const ok = (res: ServerResponse, data: unknown = {}, status = 200) => sendJson(res, status, { success: true, data });

export function fail(res: ServerResponse, err: unknown, log?: (e: unknown, req?: IncomingMessage) => void) {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && err.details?.retryAfter) headers['Retry-After'] = err.details.retryAfter;
    return sendJson(res, err.status, { success: false, error: { code: err.code, message: err.message, ...(err.details ? { fields: err.details } : {}) } }, headers);
  }
  // Unknown error: log internally, never leak stack traces or internals to users.
  log?.(err);
  const e = Errors.internal();
  return sendJson(res, e.status, { success: false, error: { code: e.code, message: e.message } });
}
