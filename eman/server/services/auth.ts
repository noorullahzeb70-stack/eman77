// Authentication: registration, login, sessions, password reset, email verification.
import type { Deps, UserRow } from '../types.ts';
import { newId, nowIso } from '../db/index.ts';
import { hashPassword, verifyPassword, getDummyHash, randomToken, sha256 } from '../lib/crypto.ts';
import { AppError, Errors } from '../lib/http.ts';
import { getSetting } from './settings.ts';
import { audit, notify } from './audit.ts';
import { sendEmail } from './email.ts';

export const SESSION_COOKIE = 'eman_session';
const SESSION_SHORT_MS = 12 * 60 * 60 * 1000; // 12 h without "remember me"
const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000; // 30 days with "remember me"
const RESET_TTL_MS = 60 * 60 * 1000; // 1 h
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000; // 48 h

export async function registerUser(d: Deps, input: { name: string; email: string; password: string }, ip: string) {
  if (!getSetting(d.db, 'auth.registration_open', true)) throw Errors.forbidden('Registration is currently closed.');
  const exists = d.db.get('SELECT 1 FROM users WHERE email = ?', [input.email]);
  if (exists) throw Errors.validation({ email: 'An account with this email already exists.' });

  const hash = await hashPassword(input.password);
  const id = newId('u_');
  // The very first account on a fresh installation becomes the administrator.
  const isFirst = !d.db.get('SELECT 1 FROM users LIMIT 1');
  const role = isFirst ? 'admin' : 'user';
  d.db.run('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)', [id, input.email, hash, input.name, role]);
  audit(d.db, id, isFirst ? 'user.register_first_admin' : 'user.register', { type: 'user', id }, {}, ip);
  notify(d.db, id, {
    type: 'account',
    title: 'Welcome to EMAN',
    body: isFirst
      ? 'You are the administrator. Open Admin → AI Settings to connect your AI provider.'
      : 'Ask Eman anything, explore study tools, and browse the library.',
    link: isFirst ? '/admin/ai' : '/chat',
  });
  await sendVerification(d, id, input.email);
  return d.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id])!;
}

export async function authenticate(d: Deps, email: string, password: string) {
  const user = d.db.get<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact support.');
  return user;
}

export function createSession(d: Deps, userId: string, opts: { remember: boolean; ip: string; userAgent: string }) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const ttl = opts.remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
  const expires = new Date(Date.now() + ttl).toISOString();
  d.db.run('INSERT INTO sessions (id, user_id, csrf_token, remember, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    sha256(token), userId, csrfToken, opts.remember ? 1 : 0, opts.ip, opts.userAgent.slice(0, 300), expires,
  ]);
  d.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), userId]);
  // Opportunistic cleanup of expired sessions.
  d.db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
  return { token, csrfToken, maxAgeSec: opts.remember ? Math.floor(ttl / 1000) : undefined };
}

export function findSession(d: Deps, token: string) {
  const row = d.db.get<UserRow & { session_id: string; csrf_token: string; expires_at: string; remember: number; last_seen_at: string }>(
    `SELECT u.*, s.id AS session_id, s.csrf_token, s.expires_at, s.remember, s.last_seen_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [sha256(token)],
  );
  if (!row) return null;
  if (row.expires_at < nowIso() || row.status === 'suspended') {
    d.db.run('DELETE FROM sessions WHERE id = ?', [row.session_id]);
    return null;
  }
  // Sliding expiry for "remember me" sessions; update last_seen at most once per 5 minutes.
  if (Date.now() - Date.parse(row.last_seen_at) > 5 * 60 * 1000) {
    const exp = row.remember ? new Date(Date.now() + SESSION_LONG_MS).toISOString() : row.expires_at;
    d.db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [nowIso(), exp, row.session_id]);
  }
  return row;
}

export function destroySession(d: Deps, token: string) {
  d.db.run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
}

/* ── One-time tokens ── */
function issueToken(d: Deps, userId: string, type: 'verify_email' | 'reset_password', ttlMs: number) {
  d.db.run('DELETE FROM auth_tokens WHERE user_id = ? AND type = ?', [userId, type]);
  const token = randomToken(32);
  d.db.run('INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)', [
    newId('t_'), userId, type, sha256(token), new Date(Date.now() + ttlMs).toISOString(),
  ]);
  return token;
}

function consumeToken(d: Deps, token: string, type: 'verify_email' | 'reset_password') {
  const row = d.db.get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    'SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND type = ?',
    [sha256(token), type],
  );
  if (!row || row.used_at || row.expires_at < nowIso()) {
    throw new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.');
  }
  d.db.run('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [nowIso(), row.id]);
  return row.user_id;
}

export async function sendVerification(d: Deps, userId: string, email: string) {
  const token = issueToken(d, userId, 'verify_email', VERIFY_TTL_MS);
  const link = `${d.config.appUrl}/verify-email?token=${token}`;
  await sendEmail(d.config, email, 'Verify your EMAN email', `Assalamu alaikum,\n\nPlease confirm your email address for EMAN:\n${link}\n\nThis link expires in 48 hours.`);
}

export function verifyEmail(d: Deps, token: string) {
  const userId = consumeToken(d, token, 'verify_email');
  d.db.run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [nowIso(), userId]);
  return userId;
}

export async function requestPasswordReset(d: Deps, email: string) {
  const user = d.db.get<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  // Same response whether or not the account exists (prevents account discovery).
  if (!user || user.status !== 'active') return;
  const token = issueToken(d, user.id, 'reset_password', RESET_TTL_MS);
  const link = `${d.config.appUrl}/reset-password?token=${token}`;
  await sendEmail(d.config, user.email, 'Reset your EMAN password', `We received a request to reset your password.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`);
}

export async function resetPassword(d: Deps, token: string, password: string, ip: string) {
  const userId = consumeToken(d, token, 'reset_password');
  const hash = await hashPassword(password);
  d.db.tx(() => {
    d.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), userId]);
    d.db.run('DELETE FROM sessions WHERE user_id = ?', [userId]); // sign out everywhere
  });
  audit(d.db, userId, 'user.password_reset', { type: 'user', id: userId }, {}, ip);
  notify(d.db, userId, { type: 'account', title: 'Your password was changed', body: 'If this wasn’t you, reset your password again and contact support.' });
}

export async function changePassword(d: Deps, userId: string, current: string, next: string, keepSessionId: string) {
  const user = d.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user || !(await verifyPassword(current, user.password_hash))) throw Errors.validation({ currentPassword: 'Current password is incorrect.' });
  const hash = await hashPassword(next);
  d.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), userId]);
  d.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', [userId, keepSessionId]);
  notify(d.db, userId, { type: 'account', title: 'Your password was changed' });
}
