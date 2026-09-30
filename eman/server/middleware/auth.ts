// Session loading, authentication/authorization guards and CSRF protection.
import type { Ctx, Middleware } from '../lib/router.ts';
import type { Deps, Role } from '../types.ts';
import { parseCookies } from '../lib/cookies.ts';
import { findSession, SESSION_COOKIE } from '../services/auth.ts';
import { AppError, Errors } from '../lib/http.ts';
import { safeEqual } from '../lib/crypto.ts';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Attach ctx.user / ctx.session if a valid session cookie is present. Never throws. */
export function loadSession(d: Deps, ctx: Ctx) {
  const token = parseCookies(ctx.req)[SESSION_COOKIE];
  if (!token) return;
  const row = findSession(d, token);
  if (!row) return;
  ctx.user = { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
  ctx.session = { id: row.session_id, csrfToken: row.csrf_token };
}

/**
 * CSRF defence for state-changing requests:
 *  1. Same-origin check on the Origin header (blocks cross-site form posts).
 *  2. Signed-in requests must echo the per-session CSRF token in X-CSRF-Token.
 */
export function csrfGuard(d: Deps, ctx: Ctx) {
  const method = ctx.req.method ?? 'GET';
  if (!UNSAFE.has(method)) return;
  const origin = ctx.req.headers.origin;
  if (origin) {
    const host = ctx.req.headers['x-forwarded-host'] ?? ctx.req.headers.host;
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* invalid origin */ }
    const allowed = originHost && (originHost === host || originHost === new URL(d.config.appUrl).host);
    if (!allowed) throw new AppError(403, 'CSRF_FAILED', 'Request blocked for security reasons. Please reload the page and try again.');
  }
  if (ctx.session) {
    const sent = String(ctx.req.headers['x-csrf-token'] ?? '');
    if (!sent || !safeEqual(sent, ctx.session.csrfToken)) {
      throw new AppError(403, 'CSRF_FAILED', 'Your session has expired. Please reload the page and try again.');
    }
  }
}

export const requireAuth: Middleware = (ctx, next) => {
  if (!ctx.user) throw Errors.unauthorized();
  return next();
};

/** Role check performed on the server — never trust the client for this. */
export function requireRole(...roles: Role[]): Middleware {
  return (ctx, next) => {
    if (!ctx.user) throw Errors.unauthorized();
    if (!roles.includes(ctx.user.role)) throw Errors.forbidden();
    return next();
  };
}
