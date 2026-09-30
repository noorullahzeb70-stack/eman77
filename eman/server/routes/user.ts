// /api/user/* — profile, preferences, password, personal AI key, dashboard summary, notifications.
import type { Router } from '../lib/router.ts';
import type { Deps, UserRow } from '../types.ts';
import { publicUser } from '../types.ts';
import { Validator, rules } from '../lib/validate.ts';
import { requireAuth } from '../middleware/auth.ts';
import { nowIso } from '../db/index.ts';
import { changePassword } from '../services/auth.ts';
import { encryptSecret, last4 } from '../lib/crypto.ts';
import { getSetting } from '../services/settings.ts';
import { Errors } from '../lib/http.ts';
import { createProvider, AIError } from '../ai/index.ts';

const LANGS = ['en', 'ar', 'ur', 'hi', 'bn', 'fr', 'es', 'tr', 'id', 'ms'] as const;
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openai-compatible'] as const;

export function userRoutes(api: Router, d: Deps) {
  api.get('/api/user/profile', requireAuth, (ctx) => {
    const u = d.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [ctx.user!.id])!;
    return { user: publicUser(u) };
  });

  api.put('/api/user/profile', requireAuth, async (ctx) => {
    const b = await ctx.json();
    const v = new Validator();
    const name = v.check('name', b.name, rules.string({ min: 2, max: 80, label: 'Name' }));
    const bio = v.check('bio', b.bio, rules.string({ max: 500, label: 'Bio', optional: true, multiline: true }));
    const language = v.check('language', b.language ?? 'en', rules.oneOf(LANGS, 'Language'));
    const theme = v.check('theme', b.theme ?? 'system', rules.oneOf(['light', 'dark', 'system'] as const, 'Theme'));
    v.done();
    d.db.run('UPDATE users SET name = ?, bio = ?, language = ?, theme = ?, updated_at = ? WHERE id = ?', [name, bio || null, language, theme, nowIso(), ctx.user!.id]);
    const u = d.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [ctx.user!.id])!;
    return { user: publicUser(u) };
  });

  api.patch('/api/user/theme', requireAuth, async (ctx) => {
    const b = await ctx.json();
    const theme = new Validator().check('theme', b.theme, rules.oneOf(['light', 'dark', 'system'] as const, 'Theme'));
    if (!theme) throw Errors.badRequest('Invalid theme.');
    d.db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, ctx.user!.id]);
    return { theme };
  });

  api.put('/api/user/password', requireAuth, async (ctx) => {
    d.limiter.hit(`pwchange:${ctx.user!.id}`, 5, 60 * 60 * 1000);
    const b = await ctx.json();
    const v = new Validator();
    const current = v.check('currentPassword', b.currentPassword, rules.string({ label: 'Current password', trim: false }));
    const next = v.check('newPassword', b.newPassword, rules.password());
    if (next && b.confirmPassword !== b.newPassword) v.errors.confirmPassword = 'Passwords do not match.';
    v.done();
    await changePassword(d, ctx.user!.id, current, next, ctx.session!.id);
    return { changed: true };
  });

  /* ── Personal AI key ("bring your own key") ── */
  api.get('/api/user/ai-key', requireAuth, () => {
    return { allowed: getSetting(d.db, 'ai.allow_user_keys', true) };
  });
  api.get('/api/user/ai-key/current', requireAuth, (ctx) => {
    const row = d.db.get<{ provider: string; base_url: string | null; key_last4: string; model: string; updated_at: string }>(
      'SELECT provider, base_url, key_last4, model, updated_at FROM user_ai_keys WHERE user_id = ?', [ctx.user!.id]);
    return {
      allowed: getSetting(d.db, 'ai.allow_user_keys', true),
      key: row ? { provider: row.provider, baseUrl: row.base_url, last4: row.key_last4, model: row.model, updatedAt: row.updated_at } : null,
    };
  });

  api.put('/api/user/ai-key', requireAuth, async (ctx) => {
    if (!getSetting(d.db, 'ai.allow_user_keys', true)) throw Errors.forbidden('Personal API keys are disabled by the administrator.');
    d.limiter.hit(`userkey:${ctx.user!.id}`, 10, 60 * 60 * 1000);
    const b = await ctx.json();
    const v = new Validator();
    const provider = v.check('provider', b.provider, rules.oneOf(PROVIDERS, 'Provider'));
    const apiKey = v.check('apiKey', b.apiKey, rules.string({ min: 8, max: 400, label: 'API key' }));
    const model = v.check('model', b.model, rules.string({ min: 1, max: 120, label: 'Model' }));
    const baseUrl = provider === 'openai-compatible' ? v.check('baseUrl', b.baseUrl, rules.url()) : '';
    v.done();
    // Verify the key works before saving it.
    try {
      const p = createProvider(provider, { apiKey, baseUrl: baseUrl || undefined });
      await p.listModels(AbortSignal.timeout(15_000));
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('NETWORK_ERROR');
      throw Errors.validation({ apiKey: err.code === 'INVALID_API_KEY' ? 'This API key was rejected by the provider.' : `Could not verify the key: ${err.userMessage}` });
    }
    d.db.run(
      `INSERT INTO user_ai_keys (user_id, provider, base_url, api_key_enc, key_last4, model) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, api_key_enc = excluded.api_key_enc,
         key_last4 = excluded.key_last4, model = excluded.model, updated_at = ?`,
      [ctx.user!.id, provider, baseUrl || null, encryptSecret(apiKey, d.config.encryptionKey), last4(apiKey), model, nowIso()],
    );
    return { saved: true, last4: last4(apiKey) };
  });

  api.delete('/api/user/ai-key', requireAuth, (ctx) => {
    d.db.run('DELETE FROM user_ai_keys WHERE user_id = ?', [ctx.user!.id]);
    return { removed: true };
  });

  /* ── Dashboard summary (all real data) ── */
  api.get('/api/user/dashboard', requireAuth, (ctx) => {
    const uid = ctx.user!.id;
    const recent = d.db.all<{ id: string; title: string; updated_at: string; pinned: number; favorite: number; preview: string | null }>(
      `SELECT c.id, c.title, c.updated_at, c.pinned, c.favorite,
        (SELECT substr(content, 1, 140) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant' ORDER BY created_at DESC LIMIT 1) AS preview
       FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT 5`, [uid]);
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
    const since1 = new Date(Date.now() - 86400_000).toISOString();
    const stats = {
      conversations: d.db.get<{ n: number }>('SELECT COUNT(*) n FROM conversations WHERE user_id = ?', [uid])!.n,
      messages: d.db.get<{ n: number }>("SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role = 'user'", [uid])!.n,
      aiRequests7d: d.db.get<{ n: number }>("SELECT COUNT(*) n FROM ai_usage WHERE user_id = ? AND created_at >= ? AND status = 'ok'", [uid, since7])!.n,
      aiRequestsToday: d.db.get<{ n: number }>('SELECT COUNT(*) n FROM ai_usage WHERE user_id = ? AND created_at >= ?', [uid, since1])!.n,
      favorites: d.db.get<{ n: number }>('SELECT COUNT(*) n FROM favorites WHERE user_id = ?', [uid])!.n,
    };
    const daily = d.db.all<{ day: string; n: number }>(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at >= ? AND status = 'ok' GROUP BY day ORDER BY day", [uid, since7]);
    const notifications = d.db.all('SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [uid]);
    const unread = d.db.get<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', [uid])!.n;
    const favBooks = d.db.all(
      `SELECT b.id, b.title, b.author FROM favorites f JOIN books b ON b.id = f.item_id WHERE f.user_id = ? AND f.item_type = 'book' ORDER BY f.created_at DESC LIMIT 4`, [uid]);
    const limits = getSetting(d.db, 'ai.limits', { requestsPerUserPerDay: 100 });
    const aiReady = !!d.db.get('SELECT 1 FROM ai_providers WHERE is_active = 1') || !!d.config.ai.provider
      || !!d.db.get('SELECT 1 FROM user_ai_keys WHERE user_id = ?', [uid]);
    return { recent, stats, daily, notifications, unread, favBooks, dailyLimit: limits.requestsPerUserPerDay, aiReady };
  });

  /* ── Notifications ── */
  api.get('/api/notifications', requireAuth, (ctx) => {
    const items = d.db.all('SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [ctx.user!.id]);
    const unread = d.db.get<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', [ctx.user!.id])!.n;
    return { items, unread };
  });
  api.post('/api/notifications/read-all', requireAuth, (ctx) => {
    d.db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), ctx.user!.id]);
    return {};
  });
  api.post('/api/notifications/:id/read', requireAuth, (ctx) => {
    d.db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [nowIso(), ctx.params.id!, ctx.user!.id]);
    return {};
  });
  api.delete('/api/notifications/:id', requireAuth, (ctx) => {
    d.db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [ctx.params.id!, ctx.user!.id]);
    return {};
  });
}
