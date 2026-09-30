// OpenAI and any OpenAI-compatible API (Groq, OpenRouter, Together, DeepSeek,
// Mistral, LM Studio, Ollama, vLLM …) via the Chat Completions endpoint.
import type { AIProvider, GenerateOptions, GenerateResult, StreamEvent, ProviderCredentials, ProviderModel, ChatMessage, ImageInput, DocumentInput } from '../types.ts';
import { AIError } from '../errors.ts';
import { aiFetch, readJson, parseSSE, parseJsonEvent, documentsAsText } from '../http.ts';

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

function toOpenAIMessages(system: string | undefined, messages: ChatMessage[]) {
  const out: { role: string; content: string | Part[] }[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    const text = m.content + documentsAsText(m.documents);
    if (m.images?.length) {
      const parts: Part[] = m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.dataBase64}` } }));
      parts.unshift({ type: 'text', text: text || ' ' });
      out.push({ role: m.role, content: parts });
    } else {
      out.push({ role: m.role, content: text });
    }
  }
  return out;
}

function finish(r: string | null | undefined): GenerateResult['finishReason'] {
  if (r === 'stop') return 'stop';
  if (r === 'length') return 'length';
  if (r === 'content_filter') return 'filtered';
  return 'other';
}

export class OpenAIProvider implements AIProvider {
  readonly kind: 'openai' | 'openai-compatible';
  private base: string;
  constructor(private creds: ProviderCredentials, kind: 'openai' | 'openai-compatible' = 'openai') {
    this.kind = kind;
    if (kind === 'openai-compatible' && !creds.baseUrl) throw new AIError('NOT_CONFIGURED', 'openai-compatible provider needs a base URL');
    this.base = (creds.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  private headers() {
    return { 'content-type': 'application/json', authorization: `Bearer ${this.creds.apiKey}` };
  }

  private body(o: GenerateOptions, stream: boolean) {
    // OpenAI's newer models require max_completion_tokens; compatible servers expect max_tokens.
    const limitKey = this.kind === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    return JSON.stringify({
      model: o.model,
      messages: toOpenAIMessages(o.system, o.messages),
      [limitKey]: o.maxTokens ?? 2048,
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    });
  }

  async generateResponse(o: GenerateOptions): Promise<GenerateResult> {
    const res = await aiFetch(`${this.base}/chat/completions`, { method: 'POST', headers: this.headers(), body: this.body(o, false), timeoutMs: o.timeoutMs, userSignal: o.signal });
    const j = await readJson<{ choices?: { message?: { content?: string | null }; finish_reason?: string }[]; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }>(res);
    const choice = j.choices?.[0];
    if (!choice?.message) throw new AIError('MALFORMED_RESPONSE', 'missing choices');
    return {
      text: choice.message.content ?? '',
      model: j.model ?? o.model,
      usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 },
      finishReason: finish(choice.finish_reason),
    };
  }

  async *streamResponse(o: GenerateOptions): AsyncGenerator<StreamEvent> {
    const res = await aiFetch(`${this.base}/chat/completions`, { method: 'POST', headers: this.headers(), body: this.body(o, true), timeoutMs: 600_000, userSignal: o.signal });
    let usage = { inputTokens: 0, outputTokens: 0 };
    let reason: string | null = null;
    let model = o.model;
    for await (const ev of parseSSE(res, { idleMs: o.timeoutMs ?? 60_000, userSignal: o.signal })) {
      if (ev.data === '[DONE]') break;
      const d = parseJsonEvent<any>(ev.data);
      if (d.error) throw new AIError('PROVIDER_UNAVAILABLE', String(d.error?.message ?? 'stream error'));
      if (d.model) model = d.model;
      const c = d.choices?.[0];
      const text = c?.delta?.content;
      if (typeof text === 'string' && text) yield { type: 'text', text };
      if (c?.finish_reason) reason = c.finish_reason;
      if (d.usage) usage = { inputTokens: d.usage.prompt_tokens ?? 0, outputTokens: d.usage.completion_tokens ?? 0 };
    }
    yield { type: 'done', usage, finishReason: finish(reason), model };
  }

  analyzeImage(o: Omit<GenerateOptions, 'messages'> & { prompt: string; image: ImageInput }) {
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, images: [o.image] }] });
  }

  analyzeDocument(o: Omit<GenerateOptions, 'messages'> & { prompt: string; document: DocumentInput }) {
    if (!o.document.text) throw new AIError('NOT_SUPPORTED', 'document text extraction required for this provider');
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, documents: [o.document] }] });
  }

  async generateEmbedding(o: { model: string; input: string[]; signal?: AbortSignal }): Promise<number[][]> {
    const res = await aiFetch(`${this.base}/embeddings`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ model: o.model, input: o.input }), timeoutMs: 60_000, userSignal: o.signal });
    const j = await readJson<{ data?: { embedding: number[]; index: number }[] }>(res);
    if (!Array.isArray(j.data)) throw new AIError('MALFORMED_RESPONSE', 'embeddings');
    return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const res = await aiFetch(`${this.base}/models`, { headers: this.headers(), timeoutMs: 15_000, userSignal: signal });
    const j = await readJson<{ data?: { id: string }[] }>(res);
    if (!Array.isArray(j.data)) throw new AIError('MALFORMED_RESPONSE', 'models list');
    return j.data.map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
  }
}
