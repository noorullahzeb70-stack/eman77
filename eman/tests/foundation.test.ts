// Database schema + HTTP app foundation tests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { Database, migrate, newId } from '../server/db/index.ts';
import { createApp } from '../server/app.ts';
import { readConfig } from '../server/config/env.ts';

const MIGRATIONS = path.resolve(import.meta.dirname, '../server/db/migrations');

test('migrations apply cleanly and are idempotent', () => {
  const db = new Database(':memory:');
  const first = migrate(db, MIGRATIONS);
  assert.ok(first.length >= 2);
  assert.deepEqual(migrate(db, MIGRATIONS), []);
  const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((t) => t.name);
  for (const t of ['users', 'sessions', 'conversations', 'messages', 'books', 'gallery_items', 'education_resources', 'favorites', 'bookmarks', 'notifications', 'admin_logs', 'ai_usage', 'ai_providers', 'settings', 'categories', 'files']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  db.close();
});

test('constraints: unique email (case-insensitive), role check, cascade delete', () => {
  const db = new Database(':memory:');
  migrate(db, MIGRATIONS);
  const u = newId('u_');
  db.run("INSERT INTO users (id, email, password_hash, name) VALUES (?, 'A@x.com', 'h', 'A')", [u]);
  assert.throws(() => db.run("INSERT INTO users (id, email, password_hash, name) VALUES (?, 'a@X.com', 'h', 'B')", [newId()]));
  assert.throws(() => db.run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?, 'b@x.com', 'h', 'B', 'superuser')", [newId()]));
  const c = newId('c_');
  db.run('INSERT INTO conversations (id, user_id) VALUES (?, ?)', [c, u]);
  db.run("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', 'hi')", [newId(), c]);
  db.run('DELETE FROM users WHERE id = ?', [u]);
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) n FROM messages')!.n, 0);
  db.close();
});

test('only one AI provider can be active', () => {
  const db = new Database(':memory:');
  migrate(db, MIGRATIONS);
  const ins = "INSERT INTO ai_providers (id, label, provider, api_key_enc, key_last4, is_active) VALUES (?, 'x', 'openai', 'enc', '1234', ?)";
  db.run(ins, [newId(), 1]);
  db.run(ins, [newId(), 0]);
  assert.throws(() => db.run(ins, [newId(), 1]));
  db.close();
});

test('default settings seeded (system prompt, limits)', () => {
  const db = new Database(':memory:');
  migrate(db, MIGRATIONS);
  const sp = JSON.parse(db.get<{ value: string }>("SELECT value FROM settings WHERE key='ai.system_prompt'")!.value);
  assert.match(sp, /You are Eman/);
  assert.match(sp, /Never invent facts/);
  assert.equal(db.all("SELECT * FROM categories WHERE type='book'").length, 9);
  db.close();
});

test('config: production requires secrets', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /AUTH_SECRET/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: 'nothex' }), /ENCRYPTION_KEY/);
  assert.throws(() => readConfig({ NODE_ENV: 'test', AI_PROVIDER: 'skynet' }), /AI_PROVIDER/);
  const c = readConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: 'a'.repeat(64) });
  assert.equal(c.isProd, true);
});

describeHttp();
function describeHttp() {
  let base = '';
  let close: () => void;
  let dir: string;
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'eman-'));
    const pub = path.join(dir, 'public');
    mkdirSync(path.join(pub, 'assets'), { recursive: true });
    writeFileSync(path.join(pub, 'index.html'), '<!doctype html><html><head><script>var t=1;</script></head><body><div id="root"></div></body></html>');
    writeFileSync(path.join(pub, 'assets', 'app-ABCDEFGH.js'), 'console.log(1);'.repeat(200));
    const db = new Database(':memory:');
    migrate(db, MIGRATIONS);
    const app = createApp({ config: readConfig({ NODE_ENV: 'test' }), db, publicDir: pub });
    const server = app.server();
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => { server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); };
  });
  after(() => close());

  test('GET /api/health returns consistent success JSON', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.success, true);
    assert.equal(j.data.db, true);
  });

  test('unknown API route → consistent error JSON', async () => {
    const r = await fetch(`${base}/api/nope`);
    assert.equal(r.status, 404);
    const j = await r.json();
    assert.deepEqual(Object.keys(j), ['success', 'error']);
    assert.equal(j.success, false);
    assert.equal(j.error.code, 'NOT_FOUND');
  });

  test('wrong method → 405', async () => {
    const r = await fetch(`${base}/api/health`, { method: 'DELETE' });
    assert.equal(r.status, 405);
  });

  test('security headers present, CSP allows exact inline script hash only', async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    const csp = r.headers.get('content-security-policy')!;
    assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]{44}'/);
    assert.ok(!csp.includes('unsafe-eval'));
    assert.match(csp, /frame-ancestors 'none'/);
  });

  test('SPA fallback serves app shell; hashed assets are immutable + compressed', async () => {
    const r = await fetch(`${base}/books/some-id`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /id="root"/);
    const a = await fetch(`${base}/assets/app-ABCDEFGH.js`, { headers: { 'accept-encoding': 'br' } });
    assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(a.headers.get('content-encoding'), 'br');
  });

  test('path traversal is blocked', async () => {
    const r = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    assert.notEqual(r.status, 200, 'should not serve files outside public');
    const r2 = await fetch(`${base}/assets/..%2f..%2f..%2fpackage.json`);
    assert.equal(r2.status, 404);
  });

  test('unknown file extension → 404, not the app shell', async () => {
    const r = await fetch(`${base}/missing.png`);
    assert.equal(r.status, 404);
  });
}
