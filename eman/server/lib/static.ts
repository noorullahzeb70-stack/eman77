// Static file serving for the built client, with long-term caching for hashed
// assets, gzip/brotli compression, and SPA fallback to index.html.
import { createReadStream, statSync, readFileSync, existsSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt', '.xml']);

interface Cached { body: Buffer; br?: Buffer; gz?: Buffer; etag: string; type: string; immutable: boolean }

export function createStatic(publicDir: string) {
  const root = path.resolve(publicDir);
  const cache = new Map<string, Cached>();

  function load(file: string): Cached | null {
    const hit = cache.get(file);
    if (hit) return hit;
    let st;
    try { st = statSync(file); } catch { return null; }
    if (!st.isFile()) return null;
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    const body = readFileSync(file);
    const entry: Cached = {
      body,
      etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`,
      type,
      immutable: /\/assets\//.test(file) && /-[A-Z0-9]{8}\.(js|css)$|chunk-[A-Z0-9]{8}\.js$/.test(file),
    };
    if (COMPRESSIBLE.has(ext) && body.length > 1024) {
      entry.br = brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 10 } });
      entry.gz = gzipSync(body, { level: 9 });
    }
    // Only cache small-ish files in memory.
    if (body.length < 2 * 1024 * 1024) cache.set(file, entry);
    return entry;
  }

  function send(req: IncomingMessage, res: ServerResponse, c: Cached, cacheControl: string, status = 200) {
    res.setHeader('Content-Type', c.type);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('ETag', c.etag);
    res.setHeader('Vary', 'Accept-Encoding');
    if (status === 200 && req.headers['if-none-match'] === c.etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    const ae = String(req.headers['accept-encoding'] ?? '');
    let body = c.body;
    if (c.br && /\bbr\b/.test(ae)) { body = c.br; res.setHeader('Content-Encoding', 'br'); }
    else if (c.gz && /\bgzip\b/.test(ae)) { body = c.gz; res.setHeader('Content-Encoding', 'gzip'); }
    res.setHeader('Content-Length', body.length);
    res.writeHead(status);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const indexPath = path.join(root, 'index.html');

  return {
    indexHtml: () => (existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''),
    /** Serve a file under /public. Returns false if not found. */
    serve(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
      let rel: string;
      try { rel = decodeURIComponent(pathname); } catch { return false; }
      const file = path.resolve(root, '.' + rel);
      if (!file.startsWith(root + path.sep)) return false; // path traversal guard
      if (path.basename(file) === 'index.html') return false;
      const c = load(file);
      if (!c) return false;
      send(req, res, c, c.immutable ? 'public, max-age=31536000, immutable' : /\/(sw\.js|manifest\.webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
      return true;
    },
    /** SPA fallback: every non-API, non-file route renders the app shell. */
    serveIndex(req: IncomingMessage, res: ServerResponse, status = 200) {
      const c = load(indexPath);
      if (!c) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Client not built. Run: npm run build');
        return;
      }
      send(req, res, c, 'no-cache', status);
    },
    streamFile(res: ServerResponse, file: string) {
      return createReadStream(file).pipe(res);
    },
  };
}
