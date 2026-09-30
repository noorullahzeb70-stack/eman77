import type { IncomingMessage, ServerResponse } from 'node:http';

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { /* ignore malformed */ }
  }
  return out;
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: { maxAgeSec?: number; secure: boolean; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${opts.sameSite ?? 'Lax'}`];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${opts.maxAgeSec}`);
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}

export function clearCookie(res: ServerResponse, name: string, secure: boolean) {
  setCookie(res, name, '', { maxAgeSec: 0, secure });
}
