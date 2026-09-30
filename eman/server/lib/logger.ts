// Structured JSON logging. Never logs secrets, passwords, cookies or API keys.
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = ORDER[(process.env.LOG_LEVEL as Level) || 'info'] ?? 20;

const REDACT = /(api[_-]?key|authorization|password|secret|token|cookie)/i;

function clean(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 6).join('\n') };
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, depth + 1));
  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) o[k] = REDACT.test(k) ? '[redacted]' : clean(val, depth + 1);
  return o;
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < min || process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta ? (clean(meta) as object) : {}) });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => write('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => write('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write('error', m, meta),
};
