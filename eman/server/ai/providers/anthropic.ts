// Anthropic (Claude) — Messages API.
import type { AIProvider, GenerateOptions, GenerateResult, StreamEvent, ProviderCredentials, ProviderModel, ChatMessage, ImageInput, DocumentInput } from '../types.ts';
import { AIError } from '../errors.ts';
import { aiFetch, readJson, parseSSE, parseJsonEvent, documentsAsText } from '../http.ts';

const VERSION = '2023-06-01';

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string };

function toAnthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const blocks: Block[] = [];
    for (const img of m.images ?? []) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 } });
    for (const d of m.documents ?? []) {
      if (d.mimeType === 'application/pdf' && d.dataBase64 && !d.text) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.dataBase64 }, title: d.name });
      }
    }
    const text = m.content + documentsAsText(m.documents);
    if (text.trim() || blocks.length === 0) blocks.push({ type: 'text', text: text || ' ' });
    return { role: m.role, content: blocks };
  });
}

function finish(r: string | null | undefined): GenerateResult['finishReason'] {
  if (r === 'end_turn' || r === 'stop_sequence') return 'stop';
  if (r === 'max_tokens') return 'length';
  if (r === 'refusal') return 'filtered';
  return 'other';
}

export class AnthropicProvider implements AIProvider {
  readonly kind = 'anthropic' as const;
  private base: string;
  constructor(private creds: ProviderCredentials) {
    this.base = (creds.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  }

  private headers() {
    return { 'content-type': 'application/json', 'x-api-key': this.creds.apiKey, 'anthropic-version': VERSION };
  }

  private body(o: GenerateOptions, stream: boolean) {
    return JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens ?? 2048,
      ...(o.system ? { system: o.system } : {}),
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      messages: toAnthropicMessages(o.messages),
      stream,
    });
  }

  async generateResponse(o: GenerateOptions): Promise<GenerateResult> {
    const res = await aiFetch(`${this.base}/v1/messages`, { method: 'POST', headers: this.headers(), body: this.body(o, false), timeoutMs: o.timeoutMs, userSignal: o.signal });
    const j = await readJson<{ content?: { type: string; text?: string }[]; model?: string; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } }>(res);
    if (!Array.isArray(j.content)) throw new AIError('MALFORMED_RESPONSE', 'missing content');
    return {
      text: j.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''),
      model: j.model ?? o.model,
      usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 },
      finishReason: finish(j.stop_reason),
    };
  }

  async *streamResponse(o: GenerateOptions): AsyncGenerator<StreamEvent> {
    const res = await aiFetch(`${this.base}/v1/messages`, { method: 'POST', headers: this.headers(), body: this.body(o, true), timeoutMs: 600_000, userSignal: o.signal });
    let inputTokens = 0;
    let outputTokens = 0;
    let model = o.model;
    let reason: string | null = null;
    for await (const ev of parseSSE(res, { idleMs: o.timeoutMs ?? 60_000, userSignal: o.signal })) {
      if (ev.event === 'ping') continue;
      const d = parseJsonEvent<any>(ev.data);
      switch (d.type) {
        case 'message_start':
          inputTokens = d.message?.usage?.input_tokens ?? 0;
          model = d.message?.model ?? model;
          break;
        case 'content_block_delta':
          if (d.delta?.type === 'text_delta' && d.delta.text) yield { type: 'text', text: d.delta.text };
          break;
        case 'message_delta':
          outputTokens = d.usage?.output_tokens ?? outputTokens;
          reason = d.delta?.stop_reason ?? reason;
          break;
        case 'error': {
          const t = d.error?.type;
          if (t === 'overloaded_error' || t === 'api_error') throw new AIError('PROVIDER_UNAVAILABLE', t);
          if (t === 'rate_limit_error') throw new AIError('RATE_LIMITED', t);
          throw new AIError('BAD_REQUEST', t ?? 'stream error');
        }
      }
    }
    yield { type: 'done', usage: { inputTokens, outputTokens }, finishReason: finish(reason), model };
  }

  analyzeImage(o: Omit<GenerateOptions, 'messages'> & { prompt: string; image: ImageInput }) {
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, images: [o.image] }] });
  }

  analyzeDocument(o: Omit<GenerateOptions, 'messages'> & { prompt: string; document: DocumentInput }) {
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, documents: [o.document] }] });
  }

  async generateEmbedding(): Promise<number[][]> {
    throw new AIError('NOT_SUPPORTED', 'Anthropic does not provide an embeddings endpoint');
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const res = await aiFetch(`${this.base}/v1/models?limit=100`, { headers: this.headers(), timeoutMs: 15_000, userSignal: signal });
    const j = await readJson<{ data?: { id: string; display_name?: string }[] }>(res);
    if (!Array.isArray(j.data)) throw new AIError('MALFORMED_RESPONSE', 'models list');
    return j.data.map((m) => ({ id: m.id, label: m.display_name }));
  }
}
