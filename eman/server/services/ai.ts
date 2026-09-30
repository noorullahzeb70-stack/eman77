// AI service: picks which provider/key/model to use for a request, enforces limits,
// and records usage. Order of precedence for credentials:
//   1. the user's own key (if admin allows personal keys)
//   2. the active provider from Admin → AI Settings (key encrypted in DB)
//   3. AI_PROVIDER / AI_API_KEY / AI_MODEL environment variables
import type { Deps } from '../types.ts';
import { newId } from '../db/index.ts';
import { decryptSecret } from '../lib/crypto.ts';
import { createProvider, AIError, type AIProvider, type AIProviderKind } from '../ai/index.ts';
import { getSetting, DEFAULT_AI_LIMITS, type AILimits } from './settings.ts';
import { Errors } from '../lib/http.ts';
import { log } from '../lib/logger.ts';

export type Tier = 'fast' | 'balanced' | 'advanced';
export const TIERS: Tier[] = ['fast', 'balanced', 'advanced'];

export interface ProviderRow {
  id: string;
  label: string;
  provider: AIProviderKind;
  base_url: string | null;
  api_key_enc: string;
  key_last4: string;
  models: string;
  is_active: number;
  last_test_at: string | null;
  last_test_ok: number | null;
  created_at: string;
  updated_at: string;
}

export interface Resolved {
  provider: AIProvider;
  kind: AIProviderKind;
  model: string;
  tier: Tier;
  keySource: 'platform' | 'user';
}

export function parseModels(json: string): Partial<Record<Tier, string>> {
  try {
    const m = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<Record<Tier, string>> = {};
    for (const t of TIERS) if (typeof m[t] === 'string' && (m[t] as string).trim()) out[t] = (m[t] as string).trim();
    return out;
  } catch {
    return {};
  }
}

/** Choose the model for a tier, falling back to the nearest configured tier. */
function pickModel(models: Partial<Record<Tier, string>>, tier: Tier): { model: string; tier: Tier } | null {
  const order: Record<Tier, Tier[]> = {
    fast: ['fast', 'balanced', 'advanced'],
    balanced: ['balanced', 'fast', 'advanced'],
    advanced: ['advanced', 'balanced', 'fast'],
  };
  for (const t of order[tier]) if (models[t]) return { model: models[t]!, tier: t };
  return null;
}

export function activeProviderRow(d: Deps) {
  return d.db.get<ProviderRow>('SELECT * FROM ai_providers WHERE is_active = 1');
}

export function resolveAI(d: Deps, userId: string | null, tier: Tier): Resolved {
  // 1. Personal key
  if (userId && getSetting(d.db, 'ai.allow_user_keys', true)) {
    const k = d.db.get<{ provider: AIProviderKind; base_url: string | null; api_key_enc: string; model: string }>(
      'SELECT provider, base_url, api_key_enc, model FROM user_ai_keys WHERE user_id = ?', [userId]);
    if (k) {
      const apiKey = safeDecrypt(d, k.api_key_enc);
      if (apiKey) {
        return { provider: createProvider(k.provider, { apiKey, baseUrl: k.base_url ?? undefined }), kind: k.provider, model: k.model, tier, keySource: 'user' };
      }
    }
  }
  // 2. Admin-configured provider
  const row = activeProviderRow(d);
  if (row) {
    const picked = pickModel(parseModels(row.models), tier);
    const apiKey = safeDecrypt(d, row.api_key_enc);
    if (!picked) throw new AIError('NOT_CONFIGURED', 'active provider has no models selected');
    if (!apiKey) throw new AIError('INVALID_API_KEY', 'stored key could not be decrypted (ENCRYPTION_KEY changed?)');
    return { provider: createProvider(row.provider, { apiKey, baseUrl: row.base_url ?? undefined }), kind: row.provider, model: picked.model, tier: picked.tier, keySource: 'platform' };
  }
  // 3. Environment fallback
  const env = d.config.ai;
  if (env.provider && env.model && (env.apiKey || env.provider === 'openai-compatible')) {
    return { provider: createProvider(env.provider, { apiKey: env.apiKey, baseUrl: env.baseUrl || undefined }), kind: env.provider, model: env.model, tier, keySource: 'platform' };
  }
  throw new AIError('NOT_CONFIGURED');
}

function safeDecrypt(d: Deps, enc: string): string | null {
  try {
    return decryptSecret(enc, d.config.encryptionKey);
  } catch (err) {
    log.error('failed to decrypt stored AI key', { err: (err as Error).message });
    return null;
  }
}

/** Which tiers the chat UI should offer, and whether AI is ready at all. */
export function aiStatus(d: Deps, userId: string | null) {
  const labels = getSetting(d.db, 'ai.tier_labels', { fast: 'Fast', balanced: 'Balanced', advanced: 'Advanced' } as Record<Tier, string>);
  const personal = userId && getSetting(d.db, 'ai.allow_user_keys', true)
    ? d.db.get<{ provider: string; model: string }>('SELECT provider, model FROM user_ai_keys WHERE user_id = ?', [userId])
    : undefined;
  if (personal) {
    return { ready: true, source: 'user' as const, tiers: [{ id: 'balanced', label: personal.model, available: true }] };
  }
  const row = activeProviderRow(d);
  if (row) {
    const m = parseModels(row.models);
    const tiers = TIERS.filter((t) => m[t]).map((t) => ({ id: t, label: labels[t] ?? t, available: true }));
    return { ready: tiers.length > 0, source: 'platform' as const, tiers };
  }
  if (d.config.ai.provider && d.config.ai.model) {
    return { ready: true, source: 'platform' as const, tiers: [{ id: 'balanced', label: labels.balanced ?? 'Balanced', available: true }] };
  }
  return { ready: false, source: null, tiers: [] };
}

export function getLimits(d: Deps): AILimits {
  return { ...DEFAULT_AI_LIMITS, ...getSetting<Partial<AILimits>>(d.db, 'ai.limits', {}) };
}

/** Throws 429 if the user exceeds per-minute or per-day AI limits. */
export function enforceAILimits(d: Deps, userId: string, keySource: 'platform' | 'user') {
  const limits = getLimits(d);
  d.limiter.hit(`ai-min:${userId}`, limits.requestsPerMinute, 60_000, 'You are sending messages very quickly. Please wait a moment.');
  if (keySource === 'platform') {
    const since = new Date(Date.now() - 86400_000).toISOString();
    const used = d.db.get<{ n: number }>("SELECT COUNT(*) n FROM ai_usage WHERE user_id = ? AND created_at >= ? AND key_source = 'platform' AND status != 'error'", [userId, since])!.n;
    if (used >= limits.requestsPerUserPerDay) {
      throw Errors.rateLimited(`You have reached today’s limit of ${limits.requestsPerUserPerDay} AI requests. It resets within 24 hours.`);
    }
  }
}

export function recordUsage(d: Deps, u: {
  userId: string | null; conversationId?: string | null; feature?: string; kind: string; model: string; keySource: 'platform' | 'user';
  tokensIn: number; tokensOut: number; latencyMs: number; status: 'ok' | 'error' | 'stopped'; errorCode?: string;
}) {
  d.db.run(
    `INSERT INTO ai_usage (id, user_id, conversation_id, feature, provider, model, key_source, tokens_in, tokens_out, latency_ms, status, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('ai_'), u.userId, u.conversationId ?? null, u.feature ?? 'chat', u.kind, u.model, u.keySource, u.tokensIn, u.tokensOut, u.latencyMs, u.status, u.errorCode ?? null],
  );
}

export function systemPrompt(d: Deps, userName?: string) {
  const base = getSetting(d.db, 'ai.system_prompt', 'You are Eman, a helpful AI assistant for students.');
  const today = new Date().toISOString().slice(0, 10);
  return `${base}\n\nToday's date: ${today}.${userName ? ` The learner's name is ${userName}.` : ''}`;
}
