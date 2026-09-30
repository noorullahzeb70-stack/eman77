// Server configuration — read once from environment variables and validated.
// Secrets live only here on the server; nothing in this file is sent to the browser.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Minimal .env loader (no dependency). Existing process.env values win. */
export function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = (m[2] ?? '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openai-compatible'] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

export interface Config {
  env: 'production' | 'development' | 'test';
  isProd: boolean;
  port: number;
  appUrl: string;
  databasePath: string;
  authSecret: string;
  encryptionKey: Buffer;
  ai: { provider: AIProviderName | null; apiKey: string; model: string; baseUrl: string };
  storage: {
    driver: 'local' | 's3';
    uploadDir: string;
    bucket: string; region: string; endpoint: string; accessKey: string; secretKey: string; publicUrl: string;
  };
  email: { from: string; resendApiKey: string };
}

function required(name: string, value: string | undefined, isProd: boolean, fallback: string): string {
  if (value && value.trim()) return value.trim();
  if (isProd) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return fallback;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development') as Config['env'];
  const isProd = mode === 'production';

  const authSecret = required('AUTH_SECRET', env.AUTH_SECRET, isProd, 'dev-only-auth-secret-change-me-0000000000000000');
  if (isProd && authSecret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters.');

  const encHex = required('ENCRYPTION_KEY', env.ENCRYPTION_KEY, isProd, '0'.repeat(64));
  if (!/^[0-9a-fA-F]{64}$/.test(encHex)) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes).');

  const provider = (env.AI_PROVIDER || '').trim().toLowerCase();
  if (provider && !AI_PROVIDERS.includes(provider as AIProviderName)) {
    throw new Error(`AI_PROVIDER must be one of: ${AI_PROVIDERS.join(', ')}`);
  }

  const driver = (env.STORAGE_DRIVER || 'local') as 'local' | 's3';
  if (driver !== 'local' && driver !== 's3') throw new Error('STORAGE_DRIVER must be "local" or "s3".');

  return {
    env: mode,
    isProd,
    port: Number(env.PORT) || 3000,
    appUrl: (env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    databasePath: env.DATABASE_PATH || './data/eman.db',
    authSecret,
    encryptionKey: Buffer.from(encHex, 'hex'),
    ai: {
      provider: (provider || null) as AIProviderName | null,
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || '',
      baseUrl: env.AI_BASE_URL || '',
    },
    storage: {
      driver,
      uploadDir: env.UPLOAD_DIR || './data/uploads',
      bucket: env.STORAGE_BUCKET || '',
      region: env.STORAGE_REGION || 'auto',
      endpoint: env.STORAGE_ENDPOINT || '',
      accessKey: env.STORAGE_ACCESS_KEY || '',
      secretKey: env.STORAGE_SECRET_KEY || '',
      publicUrl: env.STORAGE_PUBLIC_URL || '',
    },
    email: { from: env.EMAIL_FROM || '', resendApiKey: env.RESEND_API_KEY || '' },
  };
}
