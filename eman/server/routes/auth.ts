// /api/auth/* — register, login, logout, session, password reset, email verification.
import type { Router } from '../lib/router.ts';
import type { Deps, UserRow } from '../types.ts';
import { publicUser } from '../types.ts';
import { Validator, rules } from '../lib/validate.ts';
import { setCookie, clearCookie, parseCookies } from '../lib/cookies.ts';
import { Errors } from '../lib/http.ts';
import {
  registerUser, authenticate, createSession, destroySession, SESSION_COOKIE,
  requestPasswordReset, resetPassword, verifyEmail, sendVerification,
} from '../services/auth.ts';
import { requireAuth } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';

export function authRoutes(api: Router, d: Deps) {
  const secure = d.config.isProd;

  api.get('/api/auth/me', (ctx) => {
    if (!ctx.user) return { user: null, csrfToken: null };
    const u = d.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [ctx.user.id])!;
    return { user: publicUser(u), csrfToken: ctx.session!.csrfToken };
  });

  api.post('/api/auth/register', async (ctx) => {
    d.limiter.hit(`register:${ctx.ip}`, 5, 60 * 60 * 1000, 'Too many sign-up attempts. Please try again later.');
    const b = await ctx.json();
    const v = new Validator();
    const name = v.check('name', b.name, rules.string({ min: 2, max: 80, label: 'Name' }));
    const email = v.check('email', b.email, rules.email());
    const password = v.check('password', b.password, rules.password());
    if (password && b.confirmPassword !== b.password) v.errors.confirmPassword = 'Passwords do not match.';
    if (b.acceptTerms !== true) v.errors.acceptTerms = 'Please accept the Terms and Privacy Policy.';
    v.done();
    const user = await registerUser(d, { name, email, password }, ctx.ip);
    const s = createSession(d, user.id, { remember: true, ip: ctx.ip, userAgent: String(ctx.req.headers['user-agent'] ?? '') });
    setCookie(ctx.res, SESSION_COOKIE, s.token, { maxAgeSec: s.maxAgeSec, secure });
    ctx.res.statusCode = 201;
    return { user: publicUser(user), csrfToken: s.csrfToken };
  });

  api.post('/api/auth/login', async (ctx) => {
    const b = await ctx.json();
    const v = new Validator();
    const email = v.check('email', b.email, rules.email());
    const password = v.check('password', b.password, rules.string({ label: 'Password', trim: false, max: 200 }));
    v.done();
    // Throttle by IP and by account to slow down password guessing.
    d.limiter.hit(`login-ip:${ctx.ip}`, 20, 15 * 60 * 1000, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    d.limiter.hit(`login-acct:${email}`, 8, 15 * 60 * 1000, 'Too many sign-in attempts for this account. Please wait 15 minutes or reset your password.');
    const user = await authenticate(d, email, password);
    d.limiter.reset(`login-acct:${email}`);
    const s = createSession(d, user.id, { remember: b.remember === true, ip: ctx.ip, userAgent: String(ctx.req.headers['user-agent'] ?? '') });
    setCookie(ctx.res, SESSION_COOKIE, s.token, { maxAgeSec: s.maxAgeSec, secure });
    return { user: publicUser(user), csrfToken: s.csrfToken };
  });

  api.post('/api/auth/logout', (ctx) => {
    const token = parseCookies(ctx.req)[SESSION_COOKIE];
    if (token) destroySession(d, token);
    clearCookie(ctx.res, SESSION_COOKIE, secure);
    return {};
  });

  api.post('/api/auth/forgot-password', async (ctx) => {
    d.limiter.hit(`forgot:${ctx.ip}`, 5, 60 * 60 * 1000, 'Too many requests. Please try again later.');
    const b = await ctx.json();
    const v = new Validator();
    const email = v.check('email', b.email, rules.email());
    v.done();
    await requestPasswordReset(d, email);
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  });

  api.post('/api/auth/reset-password', async (ctx) => {
    d.limiter.hit(`reset:${ctx.ip}`, 10, 60 * 60 * 1000);
    const b = await ctx.json();
    const v = new Validator();
    const token = v.check('token', b.token, rules.string({ label: 'Reset link', max: 200 }));
    const password = v.check('password', b.password, rules.password());
    if (password && b.confirmPassword !== b.password) v.errors.confirmPassword = 'Passwords do not match.';
    v.done();
    await resetPassword(d, token, password, ctx.ip);
    clearCookie(ctx.res, SESSION_COOKIE, secure);
    return { message: 'Your password has been reset. Please sign in.' };
  });

  api.post('/api/auth/verify-email', async (ctx) => {
    const b = await ctx.json();
    if (typeof b.token !== 'string' || !b.token) throw Errors.badRequest('Missing verification token.');
    const uid = verifyEmail(d, b.token);
    audit(d.db, uid, 'user.email_verified', { type: 'user', id: uid }, {}, ctx.ip);
    return { verified: true };
  });

  api.post('/api/auth/resend-verification', requireAuth, async (ctx) => {
    d.limiter.hit(`verify:${ctx.user!.id}`, 3, 60 * 60 * 1000);
    await sendVerification(d, ctx.user!.id, ctx.user!.email);
    return { sent: true };
  });
}
