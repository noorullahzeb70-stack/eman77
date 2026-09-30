// /api/admin/* — admin-only. Every route here is protected on the server by requireRole('admin').
import type { Router } from '../lib/router.ts';
import type { Deps } from '../types.ts';
import { requireRole } from '../middleware/auth.ts';
import { Validator, rules, paging } from '../lib/validate.ts';
import { newId, nowIso } from '../db/index.ts';
import { encryptSecret, decryptSecret, last4 } from '../lib/crypto.ts';
import { Errors } from '../lib/http.ts';
import { createProvider, AIError, PROVIDER_INFO, type AIProviderKind } from '../ai/index.ts';
import { parseModels, TIERS, getLimits, type ProviderRow, type Tier } from '../services/ai.ts';
import { getSetting, setSetting } from '../services/settings.ts';
import { audit } from '../services/audit.ts';

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openai-compatible'] as const;
const admin = requireRole('admin');

function providerOut(r: ProviderRow) {
  return {
    id: r.id, label: r.label, provider: r.provider, providerLabel: PROVIDER_INFO[r.provider].label,
    baseUrl: r.base_url, keyLast4: r.key_last4, models: parseModels(r.models), active: !!r.is_active,
    lastTestAt: r.last_test_at, lastTestOk: r.last_test_ok === null ? null : !!r.last_test_ok, updatedAt: r.updated_at,
  };
}

function aiErrorField(e: unknown) {
  const err = e instanceof AIError ? e : new AIError('NETWORK_ERROR', (e as Error)?.message);
  const msg: Record<string, string> = {
    INVALID_API_KEY: 'The provider rejected this API key. Check that you copied the whole key.',
    NOT_CONFIGURED: 'Missing API key or base URL.',
    NETWORK_ERROR: 'Could not reach the provider. Check the base URL and your internet connection.',
    TIMEOUT: 'The provider took too long to answer. Try again.',
    QUOTA_EXCEEDED: 'This key has no remaining credit or quota. Add billing credit with your provider.',
    RATE_LIMITED: 'The provider is rate-limiting this key right now. Try again in a minute.',
    MODEL_NOT_FOUND: 'That model is not available for this key.',
  };
  return msg[err.code] ?? `${err.userMessage} (${err.code})`;
}

export function adminRoutes(api: Router, d: Deps) {
  /* ── Overview (real counts only) ── */
  api.get('/api/admin/overview', admin, () => {
    const since1 = new Date(Date.now() - 86400_000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
    const n = (sql: string, p: (string | number)[] = []) => d.db.get<{ n: number }>(sql, p)!.n;
    return {
      users: n('SELECT COUNT(*) n FROM users'),
      newUsers7d: n('SELECT COUNT(*) n FROM users WHERE created_at >= ?', [since7]),
      activeUsers7d: n('SELECT COUNT(DISTINCT user_id) n FROM sessions WHERE last_seen_at >= ?', [since7]),
      conversations: n('SELECT COUNT(*) n FROM conversations'),
      aiRequests24h: n('SELECT COUNT(*) n FROM ai_usage WHERE created_at >= ?', [since1]),
      aiErrors24h: n("SELECT COUNT(*) n FROM ai_usage WHERE created_at >= ? AND status = 'error'", [since1]),
      uploads: n('SELECT COUNT(*) n FROM files'),
      books: n('SELECT COUNT(*) n FROM books'),
      galleryItems: n('SELECT COUNT(*) n FROM gallery_items'),
      contactNew: n("SELECT COUNT(*) n FROM contact_messages WHERE status = 'new'"),
      aiConfigured: !!d.db.get('SELECT 1 FROM ai_providers WHERE is_active = 1') || !!d.config.ai.provider,
      recentLogs: d.db.all(`SELECT l.action, l.target_type, l.created_at, u.name AS actor FROM admin_logs l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 10`),
    };
  });

  api.get('/api/admin/contact', admin, (ctx) => {
    const { limit, offset } = paging(ctx.query, 50);
    return { items: d.db.all('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]) };
  });
  api.patch('/api/admin/contact/:id', admin, async (ctx) => {
    const b = await ctx.json();
    const status = new Validator().check('status', b.status, rules.oneOf(['new', 'read', 'archived'] as const));
    if (!status) throw Errors.badRequest('Invalid status.');
    d.db.run('UPDATE contact_messages SET status = ? WHERE id = ?', [status, ctx.params.id!]);
    return {};
  });

  /* ── AI settings ── */
  api.get('/api/admin/ai', admin, () => {
    const providers = d.db.all<ProviderRow>('SELECT * FROM ai_providers ORDER BY is_active DESC, created_at DESC').map(providerOut);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const usage = d.db.all(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS requests, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
         SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out
       FROM ai_usage WHERE created_at >= ? GROUP BY day ORDER BY day`, [since]);
    const byModel = d.db.all(`SELECT provider, model, COUNT(*) AS requests, SUM(tokens_in + tokens_out) AS tokens FROM ai_usage WHERE created_at >= ? GROUP BY provider, model ORDER BY requests DESC LIMIT 10`, [since]);
    const errors = d.db.all(`SELECT error_code, COUNT(*) AS n FROM ai_usage WHERE created_at >= ? AND status = 'error' GROUP BY error_code ORDER BY n DESC`, [since]);
    return {
      providers,
      providerTypes: PROVIDERS.map((p) => ({ id: p, ...PROVIDER_INFO[p] })),
      envFallback: d.config.ai.provider ? { provider: d.config.ai.provider, model: d.config.ai.model } : null,
      settings: {
        systemPrompt: getSetting(d.db, 'ai.system_prompt', ''),
        limits: getLimits(d),
        allowUserKeys: getSetting(d.db, 'ai.allow_user_keys', true),
        tierLabels: getSetting(d.db, 'ai.tier_labels', { fast: 'Fast', balanced: 'Balanced', advanced: 'Advanced' }),
      },
      usage, byModel, errors,
    };
  });

  /** Test a key without saving it — returns the models it can use. */
  api.post('/api/admin/ai/test-key', admin, async (ctx) => {
    d.limiter.hit(`admin-ai-test:${ctx.user!.id}`, 20, 10 * 60 * 1000);
    const b = await ctx.json();
    const v = new Validator();
    const provider = v.check('provider', b.provider, rules.oneOf(PROVIDERS, 'Provider'));
    const apiKey = v.check('apiKey', b.apiKey, rules.string({ min: provider === 'openai-compatible' ? 0 : 8, max: 400, label: 'API key', optional: provider === 'openai-compatible' }));
    const baseUrl = provider === 'openai-compatible' ? v.check('baseUrl', b.baseUrl, rules.url()) : '';
    v.done();
    try {
      const models = await createProvider(provider, { apiKey, baseUrl: baseUrl || undefined }).listModels(AbortSignal.timeout(15_000));
      return { ok: true, models };
    } catch (e) {
      throw Errors.validation({ apiKey: aiErrorField(e) }, 'The connection test failed.');
    }
  });

  api.post('/api/admin/ai/providers', admin, async (ctx) => {
    const b = await ctx.json();
    const v = new Validator();
    const provider = v.check('provider', b.provider, rules.oneOf(PROVIDERS, 'Provider')) as AIProviderKind;
    const label = v.check('label', b.label || PROVIDER_INFO[provider as AIProviderKind]?.label || 'AI provider', rules.string({ max: 60, label: 'Name' }));
    const apiKey = v.check('apiKey', b.apiKey, rules.string({ min: provider === 'openai-compatible' ? 0 : 8, max: 400, label: 'API key', optional: provider === 'openai-compatible' }));
    const baseUrl = provider === 'openai-compatible' ? v.check('baseUrl', b.baseUrl, rules.url()) : '';
    v.done();
    const models: Partial<Record<Tier, string>> = {};
    for (const t of TIERS) if (typeof b.models?.[t] === 'string' && b.models[t].trim()) models[t] = String(b.models[t]).trim().slice(0, 120);
    if (!Object.keys(models).length) throw Errors.validation({ models: 'Choose at least one model.' });
    // Verify before saving.
    try {
      await createProvider(provider, { apiKey, baseUrl: baseUrl || undefined }).listModels(AbortSignal.timeout(15_000));
    } catch (e) {
      throw Errors.validation({ apiKey: aiErrorField(e) }, 'The connection test failed.');
    }
    const id = newId('aip_');
    const hasActive = !!d.db.get('SELECT 1 FROM ai_providers WHERE is_active = 1');
    const activate = b.activate === true || !hasActive;
    d.db.tx(() => {
      if (activate) d.db.run('UPDATE ai_providers SET is_active = 0 WHERE is_active = 1');
      d.db.run(
        'INSERT INTO ai_providers (id, label, provider, base_url, api_key_enc, key_last4, models, is_active, last_test_at, last_test_ok, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [id, label, provider, baseUrl || null, encryptSecret(apiKey || '', d.config.encryptionKey), apiKey ? last4(apiKey) : '—', JSON.stringify(models), activate ? 1 : 0, nowIso(), ctx.user!.id],
      );
    });
    audit(d.db, ctx.user!.id, 'ai.provider_added', { type: 'ai_provider', id }, { provider, activated: activate }, ctx.ip);
    ctx.res.statusCode = 201;
    return { provider: providerOut(d.db.get<ProviderRow>('SELECT * FROM ai_providers WHERE id = ?', [id])!) };
  });

  const getRow = (id: string) => {
    const r = d.db.get<ProviderRow>('SELECT * FROM ai_providers WHERE id = ?', [id]);
    if (!r) throw Errors.notFound('Provider not found.');
    return r;
  };

  /** Live model list for a saved provider (uses the stored key server-side). */
  api.get('/api/admin/ai/providers/:id/models', admin, async (ctx) => {
    const r = getRow(ctx.params.id!);
    try {
      const key = decryptSecret(r.api_key_enc, d.config.encryptionKey);
      const models = await createProvider(r.provider, { apiKey: key, baseUrl: r.base_url ?? undefined }).listModels(AbortSignal.timeout(15_000));
      return { models };
    } catch (e) {
      throw Errors.validation({ apiKey: aiErrorField(e) }, 'Could not load models.');
    }
  });

  /** Update label, models, base URL, or replace the API key. */
  api.put('/api/admin/ai/providers/:id', admin, async (ctx) => {
    const r = getRow(ctx.params.id!);
    const b = await ctx.json();
    const v = new Validator();
    const label = b.label !== undefined ? v.check('label', b.label, rules.string({ min: 1, max: 60, label: 'Name' })) : r.label;
    const baseUrl = r.provider === 'openai-compatible' && b.baseUrl !== undefined ? v.check('baseUrl', b.baseUrl, rules.url()) : r.base_url;
    const newKey = typeof b.apiKey === 'string' && b.apiKey.trim() ? v.check('apiKey', b.apiKey, rules.string({ min: 8, max: 400, label: 'API key' })) : null;
    v.done();
    let models = parseModels(r.models);
    if (b.models && typeof b.models === 'object') {
      models = {};
      for (const t of TIERS) if (typeof b.models[t] === 'string' && b.models[t].trim()) models[t] = String(b.models[t]).trim().slice(0, 120);
      if (!Object.keys(models).length) throw Errors.validation({ models: 'Choose at least one model.' });
    }
    let keyEnc = r.api_key_enc;
    let keyLast = r.key_last4;
    if (newKey) {
      try {
        await createProvider(r.provider, { apiKey: newKey, baseUrl: baseUrl ?? undefined }).listModels(AbortSignal.timeout(15_000));
      } catch (e) {
        throw Errors.validation({ apiKey: aiErrorField(e) }, 'The new key failed the connection test.');
      }
      keyEnc = encryptSecret(newKey, d.config.encryptionKey);
      keyLast = last4(newKey);
    }
    d.db.run('UPDATE ai_providers SET label = ?, base_url = ?, api_key_enc = ?, key_last4 = ?, models = ?, updated_at = ? WHERE id = ?',
      [label, baseUrl ?? null, keyEnc, keyLast, JSON.stringify(models), nowIso(), r.id]);
    audit(d.db, ctx.user!.id, newKey ? 'ai.key_replaced' : 'ai.provider_updated', { type: 'ai_provider', id: r.id }, {}, ctx.ip);
    return { provider: providerOut(getRow(r.id)) };
  });

  api.post('/api/admin/ai/providers/:id/activate', admin, (ctx) => {
    const r = getRow(ctx.params.id!);
    if (!Object.keys(parseModels(r.models)).length) throw Errors.badRequest('Choose models for this provider before activating it.');
    d.db.tx(() => {
      d.db.run('UPDATE ai_providers SET is_active = 0 WHERE is_active = 1');
      d.db.run('UPDATE ai_providers SET is_active = 1, updated_at = ? WHERE id = ?', [nowIso(), r.id]);
    });
    audit(d.db, ctx.user!.id, 'ai.provider_activated', { type: 'ai_provider', id: r.id }, {}, ctx.ip);
    return { provider: providerOut(getRow(r.id)) };
  });

  /** Send a tiny real prompt through the saved configuration. */
  api.post('/api/admin/ai/providers/:id/test', admin, async (ctx) => {
    d.limiter.hit(`admin-ai-test:${ctx.user!.id}`, 20, 10 * 60 * 1000);
    const r = getRow(ctx.params.id!);
    const models = parseModels(r.models);
    const model = models.balanced ?? models.fast ?? models.advanced;
    if (!model) throw Errors.badRequest('Choose a model first.');
    const started = performance.now();
    try {
      const key = decryptSecret(r.api_key_enc, d.config.encryptionKey);
      const out = await createProvider(r.provider, { apiKey: key, baseUrl: r.base_url ?? undefined }).generateResponse({
        model, messages: [{ role: 'user', content: 'Reply with exactly: Eman is connected.' }], maxTokens: 20, timeoutMs: 30_000,
      });
      d.db.run('UPDATE ai_providers SET last_test_at = ?, last_test_ok = 1 WHERE id = ?', [nowIso(), r.id]);
      return { ok: true, reply: out.text.slice(0, 200), model: out.model, latencyMs: Math.round(performance.now() - started) };
    } catch (e) {
      d.db.run('UPDATE ai_providers SET last_test_at = ?, last_test_ok = 0 WHERE id = ?', [nowIso(), r.id]);
      return { ok: false, error: aiErrorField(e) };
    }
  });

  api.delete('/api/admin/ai/providers/:id', admin, (ctx) => {
    const r = getRow(ctx.params.id!);
    d.db.run('DELETE FROM ai_providers WHERE id = ?', [r.id]);
    audit(d.db, ctx.user!.id, 'ai.provider_deleted', { type: 'ai_provider', id: r.id }, { provider: r.provider }, ctx.ip);
    return { deleted: true };
  });

  api.put('/api/admin/ai/settings', admin, async (ctx) => {
    const b = await ctx.json(64 * 1024);
    const v = new Validator();
    const systemPrompt = v.check('systemPrompt', b.systemPrompt, rules.string({ min: 20, max: 12000, label: 'System prompt', multiline: true }));
    const perDay = v.check('requestsPerUserPerDay', b.limits?.requestsPerUserPerDay, rules.int({ min: 1, max: 100000, label: 'Daily limit' }));
    const perMin = v.check('requestsPerMinute', b.limits?.requestsPerMinute, rules.int({ min: 1, max: 600, label: 'Per-minute limit' }));
    const maxInput = v.check('maxInputChars', b.limits?.maxInputChars, rules.int({ min: 1000, max: 400000, label: 'Max input' }));
    const maxOut = v.check('maxOutputTokens', b.limits?.maxOutputTokens, rules.int({ min: 64, max: 64000, label: 'Max answer length' }));
    v.done();
    setSetting(d.db, 'ai.system_prompt', systemPrompt, ctx.user!.id);
    setSetting(d.db, 'ai.limits', { requestsPerUserPerDay: perDay, requestsPerMinute: perMin, maxInputChars: maxInput, maxOutputTokens: maxOut }, ctx.user!.id);
    setSetting(d.db, 'ai.allow_user_keys', b.allowUserKeys === true, ctx.user!.id);
    if (b.tierLabels && typeof b.tierLabels === 'object') {
      const labels: Record<string, string> = {};
      for (const t of TIERS) labels[t] = String(b.tierLabels[t] ?? t).slice(0, 30) || t;
      setSetting(d.db, 'ai.tier_labels', labels, ctx.user!.id);
    }
    audit(d.db, ctx.user!.id, 'ai.settings_updated', { type: 'settings' }, {}, ctx.ip);
    return { saved: true };
  });
}
