// End-to-end API tests: auth, CSRF, authorization, admin AI settings, streaming chat.
// A local mock server imitates an OpenAI-compatible AI provider, so the full chat path runs for real.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { Database, migrate } from '../server/db/index.ts';
import { createApp } from '../server/app.ts';
import { readConfig } from '../server/config/env.ts';

const MIGRATIONS = path.resolve(import.meta.dirname, '../server/db/migrations');
let base = '';
let aiBase = '';
let aiMode: 'ok' | 'fail401' | 'slow' = 'ok';
let lastAIRequest: any = null;
const cleanup: (() => void)[] = [];

/** Minimal cookie-jar client that mimics the browser app (sends CSRF header). */
class Client {
  cookie = '';
  csrf = '';
  async req(method: string, url: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
    if (body !== undefined && !(body instanceof Buffer)) headers['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers, body: body instanceof Buffer ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const set = r.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(';');
      if (pair!.startsWith('eman_session=')) this.cookie = pair!.endsWith('=') ? '' : pair!;
    }
    const ct = r.headers.get('content-type') ?? '';
    const json = ct.includes('json') ? await r.json() : null;
    if (json?.data?.csrfToken) this.csrf = json.data.csrfToken;
    return { status: r.status, json, res: r };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b?: unknown) => this.req('POST', u, b ?? {});
  put = (u: string, b?: unknown) => this.req('PUT', u, b ?? {});
  patch = (u: string, b?: unknown) => this.req('PATCH', u, b ?? {});
  del = (u: string) => this.req('DELETE', u);
  async stream(body: unknown) {
    const r = await fetch(base + '/api/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: this.cookie, 'x-csrf-token': this.csrf },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    const events = text.split('\n\n').filter((b) => b.startsWith('event:')).map((b) => {
      const [e, d] = b.split('\n');
      return { event: e!.slice(7), data: JSON.parse(d!.slice(6)) };
    });
    return { status: r.status, events, text };
  }
}

before(async () => {
  // Mock AI provider (OpenAI-compatible)
  const ai = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    if (req.url?.endsWith('/models')) {
      if (req.headers.authorization !== 'Bearer good-key-123') { res.writeHead(401).end('{"error":"invalid api key"}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'mock-fast' }, { id: 'mock-smart' }] }));
      return;
    }
    lastAIRequest = JSON.parse(raw || '{}');
    if (aiMode === 'fail401') { res.writeHead(401).end('{"error":"bad key"}'); return; }
    if (!lastAIRequest.stream) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: lastAIRequest.model, choices: [{ message: { content: 'Eman is connected.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 4 } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const parts = ['Photo', 'synthesis ', 'turns **light** into energy.'];
    for (const p of parts) {
      res.write(`data: ${JSON.stringify({ model: lastAIRequest.model, choices: [{ delta: { content: p } }] })}\n\n`);
      if (aiMode === 'slow') await new Promise((r) => setTimeout(r, 200));
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 6 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => ai.listen(0, r));
  aiBase = `http://127.0.0.1:${(ai.address() as AddressInfo).port}/v1`;

  const dir = mkdtempSync(path.join(tmpdir(), 'eman-api-'));
  const pub = path.join(dir, 'public');
  mkdirSync(pub, { recursive: true });
  writeFileSync(path.join(pub, 'index.html'), '<!doctype html><div id="root"></div>');
  const db = new Database(':memory:');
  migrate(db, MIGRATIONS);
  const config = readConfig({ NODE_ENV: 'test', UPLOAD_DIR: path.join(dir, 'uploads'), ENCRYPTION_KEY: 'ab'.repeat(32) });
  const app = createApp({ config, db, publicDir: pub });
  const server = app.server();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanup.push(() => server.close(), () => ai.close(), () => db.close(), () => rmSync(dir, { recursive: true, force: true }));
});
after(() => cleanup.forEach((f) => f()));

const admin = new Client();
const alice = new Client();
const anon = new Client();

describe('authentication', () => {
  test('register validates input', async () => {
    const r = await anon.post('/api/auth/register', { name: 'A', email: 'bad', password: 'short', confirmPassword: 'x' });
    assert.equal(r.status, 422);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    for (const f of ['name', 'email', 'password', 'acceptTerms']) assert.ok(r.json.error.fields[f], `field ${f}`);
  });

  test('first user becomes admin; password never returned', async () => {
    const r = await admin.post('/api/auth/register', { name: 'Admin Person', email: 'Admin@Example.com', password: 'secret123', confirmPassword: 'secret123', acceptTerms: true });
    assert.equal(r.status, 201);
    assert.equal(r.json.data.user.role, 'admin');
    assert.equal(r.json.data.user.email, 'admin@example.com');
    assert.ok(!JSON.stringify(r.json).includes('secret123'));
    assert.ok(!('password_hash' in r.json.data.user));
    assert.match(r.res.headers.getSetCookie()[0]!, /HttpOnly/);
  });

  test('second user is a normal user; duplicate email rejected', async () => {
    const r = await alice.post('/api/auth/register', { name: 'Alice', email: 'alice@example.com', password: 'wonder123', confirmPassword: 'wonder123', acceptTerms: true });
    assert.equal(r.json.data.user.role, 'user');
    const dup = await anon.post('/api/auth/register', { name: 'Alice 2', email: 'ALICE@example.com', password: 'wonder123', confirmPassword: 'wonder123', acceptTerms: true });
    assert.equal(dup.status, 422);
    assert.ok(dup.json.error.fields.email);
  });

  test('client cannot choose its own role', async () => {
    const c = new Client();
    const r = await c.post('/api/auth/register', { name: 'Mallory', email: 'mal@example.com', password: 'hacker123', confirmPassword: 'hacker123', acceptTerms: true, role: 'admin' });
    assert.equal(r.json.data.user.role, 'user');
  });

  test('login: wrong password → 401 generic message; right password works', async () => {
    const c = new Client();
    const bad = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'nope1234' });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.message, 'Incorrect email or password.');
    const unknown = await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'nope1234' });
    assert.equal(unknown.json.error.message, bad.json.error.message, 'same message for unknown email');
    const ok = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'wonder123', remember: true });
    assert.equal(ok.status, 200);
    const me = await c.get('/api/auth/me');
    assert.equal(me.json.data.user.name, 'Alice');
    // logout
    await c.post('/api/auth/logout');
    const after = await c.get('/api/auth/me');
    assert.equal(after.json.data.user, null);
  });

  test('protected routes require login', async () => {
    for (const u of ['/api/user/profile', '/api/conversations', '/api/user/dashboard']) {
      const r = await anon.get(u);
      assert.equal(r.status, 401, u);
    }
  });

  test('CSRF: signed-in POST without token is rejected; cross-site origin rejected', async () => {
    const r = await fetch(base + '/api/conversations', { method: 'POST', headers: { cookie: alice.cookie, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, 'CSRF_FAILED');
    const r2 = await fetch(base + '/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'x' }) });
    assert.equal(r2.status, 403);
  });

  test('forgot password gives the same answer for unknown emails; reset with bad token fails', async () => {
    const a = await anon.post('/api/auth/forgot-password', { email: 'alice@example.com' });
    const b = await anon.post('/api/auth/forgot-password', { email: 'nobody@example.com' });
    assert.equal(a.json.data.message, b.json.data.message);
    const r = await anon.post('/api/auth/reset-password', { token: 'fake', password: 'newpass123', confirmPassword: 'newpass123' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_TOKEN');
  });

  test('login is rate limited per account', async () => {
    const c = new Client();
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await c.post('/api/auth/login', { email: 'mal@example.com', password: 'wrong999' })).status;
    assert.equal(last, 429);
  });
});

describe('admin protection', () => {
  test('normal users get 403 on admin APIs', async () => {
    for (const [m, u] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/ai'], ['POST', '/api/admin/ai/providers'], ['PUT', '/api/admin/ai/settings']] as const) {
      const r = await alice.req(m, u, m === 'GET' ? undefined : {});
      assert.equal(r.status, 403, `${m} ${u}`);
    }
    assert.equal((await anon.get('/api/admin/overview')).status, 401);
  });
});

describe('AI settings + chat', () => {
  test('chat before AI is configured → friendly 503', async () => {
    const r = await alice.stream({ content: 'Hello' });
    assert.equal(r.status, 503);
    assert.match(r.text, /has not been set up yet/);
  });

  test('admin: bad key is rejected with a clear message and nothing is saved', async () => {
    const r = await admin.post('/api/admin/ai/providers', { provider: 'openai-compatible', baseUrl: aiBase, apiKey: 'wrong-key-999', models: { balanced: 'mock-smart' } });
    assert.equal(r.status, 422);
    assert.match(r.json.error.fields.apiKey, /rejected this API key/);
    assert.equal((await admin.get('/api/admin/ai')).json.data.providers.length, 0);
  });

  test('admin: test key lists live models, then save + activate', async () => {
    const t = await admin.post('/api/admin/ai/test-key', { provider: 'openai-compatible', baseUrl: aiBase, apiKey: 'good-key-123' });
    assert.deepEqual(t.json.data.models.map((m: any) => m.id), ['mock-fast', 'mock-smart']);
    const r = await admin.post('/api/admin/ai/providers', { provider: 'openai-compatible', label: 'Mock', baseUrl: aiBase, apiKey: 'good-key-123', models: { fast: 'mock-fast', balanced: 'mock-smart' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.data.provider.active, true);
    assert.equal(r.json.data.provider.keyLast4, '-123');
    // The key itself is never returned
    const list = await admin.get('/api/admin/ai');
    assert.ok(!JSON.stringify(list.json).includes('good-key-123'));
    const test2 = await admin.post(`/api/admin/ai/providers/${r.json.data.provider.id}/test`);
    assert.equal(test2.json.data.ok, true);
    assert.equal(test2.json.data.reply, 'Eman is connected.');
  });

  test('ai status shows configured tiers only', async () => {
    const s = await alice.get('/api/ai/status');
    assert.equal(s.json.data.ready, true);
    assert.deepEqual(s.json.data.tiers.map((t: any) => t.id), ['fast', 'balanced']);
  });

  let convId = '';
  test('streaming chat: meta → deltas → done; saved to history with system prompt', async () => {
    const r = await alice.stream({ content: 'Explain photosynthesis simply', tier: 'balanced' });
    assert.equal(r.status, 200);
    const names = r.events.map((e) => e.event);
    assert.equal(names[0], 'meta');
    assert.ok(names.includes('delta'));
    assert.equal(names.at(-1), 'done');
    const text = r.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    assert.equal(text, 'Photosynthesis turns **light** into energy.');
    convId = r.events[0]!.data.conversation.id;
    assert.equal(lastAIRequest.model, 'mock-smart');
    assert.match(lastAIRequest.messages[0].content, /You are Eman/);
    const conv = await alice.get(`/api/conversations/${convId}`);
    assert.equal(conv.json.data.messages.length, 2);
    assert.equal(conv.json.data.messages[1].status, 'complete');
    assert.equal(conv.json.data.conversation.title, 'Explain photosynthesis simply');
  });

  test('follow-up includes history; fast tier uses fast model', async () => {
    await alice.stream({ conversationId: convId, content: 'Give an example', tier: 'fast' });
    assert.equal(lastAIRequest.model, 'mock-fast');
    const roles = lastAIRequest.messages.map((m: any) => m.role);
    assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  });

  test('regenerate replaces the last answer', async () => {
    const r = await alice.stream({ conversationId: convId, regenerate: true, tier: 'balanced' });
    assert.equal(r.events.at(-1)!.event, 'done');
    const conv = await alice.get(`/api/conversations/${convId}`);
    assert.equal(conv.json.data.messages.length, 4);
  });

  test('provider failure → error event with friendly message, saved as error', async () => {
    aiMode = 'fail401';
    const r = await alice.stream({ conversationId: convId, content: 'Another question' });
    aiMode = 'ok';
    const err = r.events.find((e) => e.event === 'error')!;
    assert.equal(err.data.code, 'INVALID_API_KEY');
    assert.match(err.data.message, /temporarily unavailable/);
    assert.ok(!r.text.includes('good-key-123'));
    // Retry (regenerate) recovers
    const retry = await alice.stream({ conversationId: convId, regenerate: true });
    assert.equal(retry.events.at(-1)!.event, 'done');
  });

  test('stop: aborting the request saves the partial answer as stopped', async () => {
    aiMode = 'slow';
    const ac = new AbortController();
    const p = fetch(base + '/api/chat/stream', {
      method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json', cookie: alice.cookie, 'x-csrf-token': alice.csrf },
      body: JSON.stringify({ conversationId: convId, content: 'Long answer please' }),
    }).then((r) => r.body!.getReader().read());
    await p;
    await new Promise((r) => setTimeout(r, 250));
    ac.abort();
    await new Promise((r) => setTimeout(r, 500));
    aiMode = 'ok';
    const conv = await alice.get(`/api/conversations/${convId}`);
    const last = conv.json.data.messages.at(-1);
    assert.equal(last.status, 'stopped');
    assert.ok(last.content.length > 0);
  });

  test('conversations: list, search, rename, pin, favorite, other users cannot see them', async () => {
    const list = await alice.get('/api/conversations');
    assert.equal(list.json.data.items.length, 1);
    const s = await alice.get('/api/conversations?q=photosynth');
    assert.equal(s.json.data.items.length, 1);
    const none = await alice.get('/api/conversations?q=zebra');
    assert.equal(none.json.data.items.length, 0);
    const p = await alice.patch(`/api/conversations/${convId}`, { title: 'Biology notes', pinned: true, favorite: true });
    assert.equal(p.json.data.conversation.title, 'Biology notes');
    assert.equal(p.json.data.conversation.pinned, true);
    const spy = await admin.get(`/api/conversations/${convId}`);
    assert.equal(spy.status, 404);
    const del = await admin.del(`/api/conversations/${convId}`);
    assert.equal(del.status, 404);
  });

  test('uploads: real image accepted and re-encoded; fake image and executable rejected', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0c6959' } }).png().toBuffer();
    const ok = await alice.req('POST', '/api/uploads?purpose=chat', png, { 'content-type': 'image/png', 'x-file-name': 'leaf.png' });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.file.mime, 'image/webp');
    const fake = await alice.req('POST', '/api/uploads?purpose=chat', Buffer.from('MZ\x90\x00 this is an exe'), { 'content-type': 'image/png', 'x-file-name': 'virus.png' });
    assert.equal(fake.status, 415);
    const exe = await alice.req('POST', '/api/uploads?purpose=chat', Buffer.from('MZ\x90\x00'), { 'content-type': 'application/octet-stream', 'x-file-name': 'setup.exe' });
    assert.equal(exe.status, 415);
    const txt = await alice.req('POST', '/api/uploads?purpose=chat', Buffer.from('Notes about cells'), { 'content-type': 'text/plain', 'x-file-name': 'notes.txt' });
    assert.equal(txt.status, 201);
    // Another user cannot read Alice's chat file
    const fid = ok.json.data.file.id;
    assert.equal((await anon.get(`/api/files/${fid}`)).status, 404);
    assert.equal((await alice.get(`/api/files/${fid}`)).status, 200);
    // Image attachment reaches the AI as an image part
    await alice.stream({ content: 'What colour is this?', attachments: [fid] });
    const last = lastAIRequest.messages.at(-1);
    assert.ok(Array.isArray(last.content));
    assert.match(last.content[1].image_url.url, /^data:image\/webp;base64,/);
  });

  test('delete conversation removes it', async () => {
    const r = await alice.del(`/api/conversations/${convId}`);
    assert.equal(r.status, 200);
    assert.equal((await alice.get(`/api/conversations/${convId}`)).status, 404);
  });

  test('admin can update system prompt and limits; validation enforced', async () => {
    const bad = await admin.put('/api/admin/ai/settings', { systemPrompt: 'short', limits: { requestsPerUserPerDay: 0 } });
    assert.equal(bad.status, 422);
    const ok = await admin.put('/api/admin/ai/settings', {
      systemPrompt: 'You are Eman, a patient tutor for nursing and anaesthesia students.',
      limits: { requestsPerUserPerDay: 100, requestsPerMinute: 10, maxInputChars: 20000, maxOutputTokens: 1000 },
      allowUserKeys: true,
    });
    assert.equal(ok.status, 200);
    const r = await alice.stream({ content: 'hi' });
    assert.match(lastAIRequest.messages[0].content, /patient tutor/);
    assert.equal(lastAIRequest.max_tokens, 1000);
    assert.equal(r.status, 200);
  });

  test('daily AI limit is enforced', async () => {
    await admin.put('/api/admin/ai/settings', {
      systemPrompt: 'You are Eman, a patient tutor for nursing and anaesthesia students.',
      limits: { requestsPerUserPerDay: 2, requestsPerMinute: 10, maxInputChars: 20000, maxOutputTokens: 1000 },
      allowUserKeys: true,
    });
    const r = await alice.stream({ content: 'one more' });
    assert.equal(r.status, 429);
    assert.match(r.text, /today’s limit/);
  });

  test('personal API key: verified, stored encrypted, used for that user only', async () => {
    const bad = await alice.put('/api/user/ai-key', { provider: 'openai-compatible', baseUrl: aiBase, apiKey: 'wrong-key-000', model: 'mock-fast' });
    assert.equal(bad.status, 422);
    const ok = await alice.put('/api/user/ai-key', { provider: 'openai-compatible', baseUrl: aiBase, apiKey: 'good-key-123', model: 'mock-fast' });
    assert.equal(ok.status, 200);
    const cur = await alice.get('/api/user/ai-key/current');
    assert.equal(cur.json.data.key.last4, '-123');
    assert.ok(!JSON.stringify(cur.json).includes('good-key-123'));
    // Personal key bypasses the platform daily limit
    const r = await alice.stream({ content: 'using my own key' });
    assert.equal(r.status, 200);
    assert.equal(lastAIRequest.model, 'mock-fast');
  });

  test('dashboard returns real stats', async () => {
    const r = await alice.get('/api/user/dashboard');
    assert.equal(r.status, 200);
    assert.ok(r.json.data.stats.conversations >= 1);
    assert.ok(r.json.data.notifications.length >= 1);
  });

  test('contact form validates and stores; admin sees it', async () => {
    const bad = await anon.post('/api/contact', { name: 'x', email: 'no', subject: '', message: 'short' });
    assert.equal(bad.status, 422);
    const ok = await anon.post('/api/contact', { name: 'Student', email: 'student@example.com', subject: 'Question', message: 'How do I reset my password?' });
    assert.equal(ok.status, 200);
    const list = await admin.get('/api/admin/contact');
    assert.equal(list.json.data.items.length, 1);
  });
});
