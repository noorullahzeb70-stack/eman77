// Tiny, dependency-free HTTP router with typed request context.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError, Errors, ok } from './http.ts';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  requestId: string;
  /** Filled by auth middleware. */
  user?: { id: string; email: string; name: string; role: 'user' | 'editor' | 'admin'; status: string };
  session?: { id: string; csrfToken: string };
  /** Parsed JSON body (lazy). */
  // Values are untrusted: always pass them through the Validator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json<T = Record<string, any>>(maxBytes?: number): Promise<T>;
  rawBody(maxBytes?: number): Promise<Buffer>;
}

export type Middleware = (ctx: Ctx, next: () => Promise<unknown>) => unknown | Promise<unknown>;
/** Final handlers receive `next` too (unused); a single signature keeps parameter types inferred. */
export type Handler = Middleware;

interface Route { method: string; parts: string[]; handlers: Middleware[] }

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, ...handlers: Middleware[]) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handlers });
    return this;
  }
  get(p: string, ...h: Middleware[]) { return this.add('GET', p, ...h); }
  post(p: string, ...h: Middleware[]) { return this.add('POST', p, ...h); }
  put(p: string, ...h: Middleware[]) { return this.add('PUT', p, ...h); }
  patch(p: string, ...h: Middleware[]) { return this.add('PATCH', p, ...h); }
  delete(p: string, ...h: Middleware[]) { return this.add('DELETE', p, ...h); }

  /** Mount another router under a prefix. */
  use(prefix: string, other: Router) {
    const pre = prefix.split('/').filter(Boolean);
    for (const r of other.routes) this.routes.push({ ...r, parts: [...pre, ...r.parts] });
    return this;
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | 'method_not_allowed' | null {
    const segs = path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i]!;
        const s = segs[i]!;
        if (p.startsWith(':')) {
          try { params[p.slice(1)] = decodeURIComponent(s); } catch { ok = false; break; }
        } else if (p !== s) { ok = false; break; }
      }
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method || (method === 'HEAD' && r.method === 'GET')) return { route: r, params };
    }
    return pathMatched ? 'method_not_allowed' : null;
  }

  async dispatch(ctx: Ctx): Promise<boolean> {
    const m = this.match(ctx.req.method ?? 'GET', ctx.url.pathname);
    if (m === null) return false;
    if (m === 'method_not_allowed') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    ctx.params = m.params;
    const chain = m.route.handlers;
    const run = async (i: number): Promise<unknown> => {
      const h = chain[i];
      if (!h) throw Errors.notFound();
      if (i === chain.length - 1) {
        // Whatever the final handler returns becomes { success: true, data } unless it already responded.
        const out = await h(ctx, async () => undefined);
        if (!ctx.res.headersSent && !ctx.res.writableEnded) ok(ctx.res, out ?? {}, ctx.res.statusCode || 200);
        return out;
      }
      return h(ctx, () => run(i + 1));
    };
    await run(0);
    return true;
  }
}

/** Read a request body with a hard size limit. */
export function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > maxBytes) {
      reject(Errors.tooLarge());
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Errors.tooLarge());
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
