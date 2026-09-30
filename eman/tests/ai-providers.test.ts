// AI provider tests with a mocked `fetch` — verifies request shape, streaming
// parsing, and that every failure mode maps to a friendly, key-free error.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, AIError } from '../server/ai/index.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Captured = { url: string; init: RequestInit };
function mockFetch(respond: (c: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const c = { url: String(url), init };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
  return calls;
}

function sse(events: string[], opts: { delayMs?: number } = {}) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        for (const e of events) {
          if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
          ctrl.enqueue(enc.encode(e));
        }
        ctrl.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

const msgs = [{ role: 'user' as const, content: 'Hello' }];

test('anthropic: non-streaming request shape and parsing', async () => {
  const calls = mockFetch(() => Response.json({ content: [{ type: 'text', text: 'Hi there' }], model: 'm-1', stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } }));
  const p = createProvider('anthropic', { apiKey: 'sk-ant-test' });
  const r = await p.generateResponse({ model: 'm-1', system: 'Be kind', messages: msgs });
  assert.equal(r.text, 'Hi there');
  assert.deepEqual(r.usage, { inputTokens: 5, outputTokens: 3 });
  assert.equal(r.finishReason, 'stop');
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(calls[0]!.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(body.system, 'Be kind');
  assert.equal((calls[0]!.init.headers as Record<string, string>)['x-api-key'], 'sk-ant-test');
});

test('anthropic: streaming yields text deltas and usage (split chunks)', async () => {
  mockFetch(() =>
    sse([
      'event: message_start\ndata: {"type":"message_start","message":{"model":"m-1","usage":{"input_tokens":7}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel',
      'lo"}}\n\nevent: ping\ndata: {"type":"ping"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":4}}\n\n',
    ]),
  );
  const p = createProvider('anthropic', { apiKey: 'k' });
  let text = '';
  let done: any;
  for await (const ev of p.streamResponse({ model: 'm-1', messages: msgs })) {
    if (ev.type === 'text') text += ev.text;
    else done = ev;
  }
  assert.equal(text, 'Hello world');
  assert.deepEqual(done.usage, { inputTokens: 7, outputTokens: 4 });
  assert.equal(done.finishReason, 'length');
});

test('openai: streaming with [DONE] and usage chunk; uses max_completion_tokens', async () => {
  const calls = mockFetch(() =>
    sse([
      'data: {"model":"gpt-x","choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"B"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ]),
  );
  const p = createProvider('openai', { apiKey: 'sk-test' });
  let text = '';
  let done: any;
  for await (const ev of p.streamResponse({ model: 'gpt-x', system: 'sys', messages: msgs, maxTokens: 100 })) {
    if (ev.type === 'text') text += ev.text; else done = ev;
  }
  assert.equal(text, 'AB');
  assert.deepEqual(done.usage, { inputTokens: 3, outputTokens: 2 });
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.max_completion_tokens, 100);
  assert.equal(body.messages[0].role, 'system');
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, 'Bearer sk-test');
});

test('openai-compatible: requires base URL and uses max_tokens', async () => {
  assert.throws(() => createProvider('openai-compatible', { apiKey: 'k' }), (e: AIError) => e.code === 'NOT_CONFIGURED');
  const calls = mockFetch(() => Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  const p = createProvider('openai-compatible', { apiKey: 'k', baseUrl: 'https://api.example.com/v1/' });
  await p.generateResponse({ model: 'llama', messages: msgs, maxTokens: 50 });
  assert.equal(calls[0]!.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(JSON.parse(String(calls[0]!.init.body)).max_tokens, 50);
});

test('gemini: request shape, image parts and streaming', async () => {
  const calls = mockFetch(() =>
    sse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Salam"}]}}]}\r\n\r\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":2}}\r\n\r\n',
    ]),
  );
  const p = createProvider('gemini', { apiKey: 'g-key' });
  let text = '';
  for await (const ev of p.streamResponse({
    model: 'gemini-test',
    system: 'sys',
    messages: [{ role: 'user', content: 'What is this?', images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] }],
  })) if (ev.type === 'text') text += ev.text;
  assert.equal(text, 'Salam!');
  assert.match(calls[0]!.url, /models\/gemini-test:streamGenerateContent\?alt=sse$/);
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
  assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/png');
});

test('errors: HTTP statuses map to friendly codes without leaking the key', async () => {
  const cases: [number, string, string][] = [
    [401, '{"error":"invalid x-api-key"}', 'INVALID_API_KEY'],
    [429, '{"error":"rate limit"}', 'RATE_LIMITED'],
    [429, '{"error":"You exceeded your current quota, check billing"}', 'QUOTA_EXCEEDED'],
    [529, '{"error":"overloaded"}', 'PROVIDER_UNAVAILABLE'],
    [503, 'Service Unavailable', 'PROVIDER_UNAVAILABLE'],
    [404, '{"error":"model not found"}', 'MODEL_NOT_FOUND'],
    [400, '{"error":"prompt is too long"}', 'CONTEXT_TOO_LONG'],
  ];
  for (const [status, body, code] of cases) {
    mockFetch(() => new Response(body, { status }));
    const p = createProvider('anthropic', { apiKey: 'sk-ant-SECRET-KEY' });
    await assert.rejects(p.generateResponse({ model: 'm', messages: msgs }), (e: AIError) => {
      assert.equal(e.code, code, `status ${status}`);
      assert.ok(!e.message.includes('SECRET'));
      assert.ok(!e.userMessage.includes('SECRET'));
      assert.ok(e.userMessage.length > 10);
      return true;
    });
  }
});

test('errors: network failure, malformed JSON, and timeout', async () => {
  mockFetch(() => { throw new TypeError('fetch failed'); });
  const p = createProvider('openai', { apiKey: 'k' });
  await assert.rejects(p.generateResponse({ model: 'm', messages: msgs }), (e: AIError) => e.code === 'NETWORK_ERROR' && e.retryable);

  mockFetch(() => new Response('<html>oops</html>', { status: 200 }));
  await assert.rejects(p.generateResponse({ model: 'm', messages: msgs }), (e: AIError) => e.code === 'MALFORMED_RESPONSE');

  mockFetch(() => Response.json({ nope: true }));
  await assert.rejects(p.generateResponse({ model: 'm', messages: msgs }), (e: AIError) => e.code === 'MALFORMED_RESPONSE');

  // Stream that stalls longer than the idle timeout.
  mockFetch(() => sse(['data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'data: [DONE]\n\n'], { delayMs: 300 }));
  await assert.rejects(async () => {
    for await (const _ of p.streamResponse({ model: 'm', messages: msgs, timeoutMs: 50 })) { /* consume */ }
  }, (e: AIError) => e.code === 'TIMEOUT');
});

test('errors: user abort (Stop button) is reported as ABORTED', async () => {
  mockFetch(() => sse(['data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"b"}}]}\n\n'], { delayMs: 50 }));
  const p = createProvider('openai', { apiKey: 'k' });
  const ac = new AbortController();
  await assert.rejects(async () => {
    for await (const ev of p.streamResponse({ model: 'm', messages: msgs, signal: ac.signal })) {
      if (ev.type === 'text') ac.abort();
    }
  }, (e: AIError) => e.code === 'ABORTED');
});

test('missing API key → NOT_CONFIGURED; anthropic embeddings → NOT_SUPPORTED', async () => {
  assert.throws(() => createProvider('anthropic', { apiKey: '' }), (e: AIError) => e.code === 'NOT_CONFIGURED');
  const p = createProvider('anthropic', { apiKey: 'k' });
  await assert.rejects(p.generateEmbedding({ model: 'x', input: ['a'] }), (e: AIError) => e.code === 'NOT_SUPPORTED');
});

test('listModels reads real model ids from the provider (no hard-coded names)', async () => {
  mockFetch(() => Response.json({ data: [{ id: 'model-b' }, { id: 'model-a' }] }));
  const models = await createProvider('openai', { apiKey: 'k' }).listModels();
  assert.deepEqual(models.map((m) => m.id), ['model-a', 'model-b']);
});
