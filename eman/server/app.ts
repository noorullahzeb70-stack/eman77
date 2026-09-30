// Application assembly: routing, middleware, static client, error handling.
import http from 'node:http';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Config } from './config/env.ts';
import type { Database } from './db/index.ts';
import { Router, readBody, type Ctx } from './lib/router.ts';
import { Errors, fail, AppError } from './lib/http.ts';
import { createStatic } from './lib/static.ts';
import { securityHeaders, setThemeScriptHash } from './middleware/security.ts';
import { log } from './lib/logger.ts';
import { RateLimiter } from './lib/ratelimit.ts';
import type { Deps } from './types.ts';
import { loadSession, csrfGuard } from './middleware/auth.ts';
import { authRoutes } from './routes/auth.ts';
import { userRoutes } from './routes/user.ts';
import { publicRoutes } from './routes/public.ts';
import { chatRoutes } from './routes/chat.ts';
import { adminRoutes } from './routes/admin.ts';

export interface AppDeps {
  config: Config;
  db: Database;
  publicDir: string;
  limiter?: RateLimiter;
}

export function createApp({ config, db, publicDir, limiter = new RateLimiter() }: AppDeps) {
  const api = new Router();
  const deps: Deps = { config, db, limiter };
  const statics = createStatic(publicDir);

  // CSP: allow exactly the inline theme-loader script shipped in index.html.
  const inline = statics.indexHtml().match(/<script>([\s\S]*?)<\/script>/);
  if (inline?.[1]) setThemeScriptHash(createHash('sha256').update(inline[1]).digest('base64'));

  // ── Health check (used by hosting platforms and uptime monitors) ──
  api.get('/api/health', () => {
    const row = db.get<{ ok: number }>('SELECT 1 AS ok');
    return { status: 'ok', db: row?.ok === 1, time: new Date().toISOString() };
  });

  // ── Public site config (branding, homepage copy). Never includes secrets. ──
  api.get('/api/site', () => {
    const rows = db.all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'site.%'");
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key.slice(5)] = JSON.parse(r.value);
    return out;
  });

  authRoutes(api, deps);
  userRoutes(api, deps);
  publicRoutes(api, deps);
  chatRoutes(api, deps);
  adminRoutes(api, deps);

  // robots.txt and sitemap.xml
  const pages = ['/', '/about', '/ai', '/features', '/education', '/books', '/gallery', '/contact', '/privacy', '/terms', '/login', '/register'];

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const started = performance.now();
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    securityHeaders(res, config.isProd);

    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }

    const ip = (config.isProd && process.env.TRUST_PROXY === '1'
      ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
      : undefined) || req.socket.remoteAddress || 'unknown';

    let bodyCache: Buffer | undefined;
    const ctx: Ctx = {
      req, res, url, ip, requestId,
      params: {},
      query: url.searchParams,
      async rawBody(max = 1024 * 1024) {
        bodyCache ??= await readBody(req, max);
        return bodyCache;
      },
      async json<T>(max = 1024 * 1024) {
        const ct = String(req.headers['content-type'] ?? '');
        if (!ct.includes('application/json')) throw Errors.unsupported('Expected a JSON request body.');
        const buf = await ctx.rawBody(max);
        if (!buf.length) return {} as T;
        try {
          const v = JSON.parse(buf.toString('utf8'));
          if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
          return v as T;
        } catch {
          throw Errors.badRequest('Invalid JSON body.');
        }
      },
    };

    try {
      if (url.pathname === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
        res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /chat\nDisallow: /settings\nSitemap: ${config.appUrl}/sitemap.xml\n`);
        return;
      }
      if (url.pathname === '/sitemap.xml') {
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${config.appUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
        res.end(body);
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        loadSession(deps, ctx);
        csrfGuard(deps, ctx);
        const matched = await api.dispatch(ctx);
        if (!matched) throw Errors.notFound('API endpoint not found.');
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        if (!statics.serve(req, res, url.pathname)) {
          // Unknown file-like paths (with an extension) are real 404s; routes go to the SPA.
          if (path.extname(url.pathname)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
          } else {
            statics.serveIndex(req, res);
          }
        }
      } else {
        throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      }
    } catch (e) {
      fail(res, e, (err) => log.error('request failed', { requestId, method: req.method, path: url.pathname, err }));
    } finally {
      if (url.pathname.startsWith('/api/')) {
        res.once('finish', () =>
          log.info('api', { requestId, method: req.method, path: url.pathname, status: res.statusCode, ms: Math.round(performance.now() - started) }),
        );
      }
    }
  }

  return { api, handle, server: () => http.createServer(handle) };
}
