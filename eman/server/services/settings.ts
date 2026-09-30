// Key/value site settings stored as JSON in the `settings` table.
import type { Database } from '../db/index.ts';
import { nowIso } from '../db/index.ts';

export function getSetting<T>(db: Database, key: string, fallback: T): T {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: Database, key: string, value: unknown, userId?: string) {
  db.run(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), userId ?? null, nowIso()],
  );
}

export interface AILimits { requestsPerUserPerDay: number; requestsPerMinute: number; maxInputChars: number; maxOutputTokens: number }
export const DEFAULT_AI_LIMITS: AILimits = { requestsPerUserPerDay: 100, requestsPerMinute: 10, maxInputChars: 24000, maxOutputTokens: 2048 };
