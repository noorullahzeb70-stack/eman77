// Google Gemini — Generative Language API (v1beta).
import type { AIProvider, GenerateOptions, GenerateResult, StreamEvent, ProviderCredentials, ProviderModel, ChatMessage, ImageInput, DocumentInput } from '../types.ts';
import { AIError } from '../errors.ts';
import { aiFetch, readJson, parseSSE, parseJsonEvent, documentsAsText } from '../http.ts';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function toContents(messages: ChatMessage[]) {
  return messages.map((m) => {
    const parts: Part[] = [];
    for (const i of m.images ?? []) parts.push({ inlineData: { mimeType: i.mimeType, data: i.dataBase64 } });
    for (const d of m.documents ?? []) {
      if (d.mimeType === 'application/pdf' && d.dataBase64 && !d.text) parts.push({ inlineData: { mimeType: 'application/pdf', data: d.dataBase64 } });
    }
    parts.push({ text: (m.content + documentsAsText(m.documents)) || ' ' });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

function finish(r: string | undefined): GenerateResult['finishReason'] {
  if (r === 'STOP') return 'stop';
  if (r === 'MAX_TOKENS') return 'length';
  if (r === 'SAFETY' || r === 'RECITATION' || r === 'BLOCKLIST' || r === 'PROHIBITED_CONTENT') return 'filtered';
  return 'other';
}

interface GeminiResp {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
}

export class GeminiProvider implements AIProvider {
  readonly kind = 'gemini' as const;
  private base: string;
  constructor(private creds: ProviderCredentials) {
    this.base = (creds.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  }

  private headers() {
    return { 'content-type': 'application/json', 'x-goog-api-key': this.creds.apiKey };
  }

  private model(m: string) {
    return encodeURIComponent(m.replace(/^models\//, ''));
  }

  private body(o: GenerateOptions) {
    return JSON.stringify({
      ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
      contents: toContents(o.messages),
      generationConfig: { maxOutputTokens: o.maxTokens ?? 2048, ...(o.temperature !== undefined ? { temperature: o.temperature } : {}) },
    });
  }

  async generateResponse(o: GenerateOptions): Promise<GenerateResult> {
    const res = await aiFetch(`${this.base}/models/${this.model(o.model)}:generateContent`, { method: 'POST', headers: this.headers(), body: this.body(o), timeoutMs: o.timeoutMs, userSignal: o.signal });
    const j = await readJson<GeminiResp>(res);
    if (j.promptFeedback?.blockReason) throw new AIError('CONTENT_FILTERED', j.promptFeedback.blockReason);
    const c = j.candidates?.[0];
    if (!c) throw new AIError('MALFORMED_RESPONSE', 'no candidates');
    return {
      text: (c.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      model: j.modelVersion ?? o.model,
      usage: { inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 },
      finishReason: finish(c.finishReason),
    };
  }

  async *streamResponse(o: GenerateOptions): AsyncGenerator<StreamEvent> {
    const res = await aiFetch(`${this.base}/models/${this.model(o.model)}:streamGenerateContent?alt=sse`, { method: 'POST', headers: this.headers(), body: this.body(o), timeoutMs: 600_000, userSignal: o.signal });
    let usage = { inputTokens: 0, outputTokens: 0 };
    let reason: string | undefined;
    let model = o.model;
    for await (const ev of parseSSE(res, { idleMs: o.timeoutMs ?? 60_000, userSignal: o.signal })) {
      const d = parseJsonEvent<GeminiResp>(ev.data);
      if (d.promptFeedback?.blockReason) throw new AIError('CONTENT_FILTERED', d.promptFeedback.blockReason);
      if (d.modelVersion) model = d.modelVersion;
      const c = d.candidates?.[0];
      const text = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (text) yield { type: 'text', text };
      if (c?.finishReason) reason = c.finishReason;
      if (d.usageMetadata) usage = { inputTokens: d.usageMetadata.promptTokenCount ?? 0, outputTokens: d.usageMetadata.candidatesTokenCount ?? 0 };
    }
    yield { type: 'done', usage, finishReason: finish(reason), model };
  }

  analyzeImage(o: Omit<GenerateOptions, 'messages'> & { prompt: string; image: ImageInput }) {
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, images: [o.image] }] });
  }

  analyzeDocument(o: Omit<GenerateOptions, 'messages'> & { prompt: string; document: DocumentInput }) {
    return this.generateResponse({ ...o, messages: [{ role: 'user', content: o.prompt, documents: [o.document] }] });
  }

  async generateEmbedding(o: { model: string; input: string[]; signal?: AbortSignal }): Promise<number[][]> {
    const m = this.model(o.model);
    const res = await aiFetch(`${this.base}/models/${m}:batchEmbedContents`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ requests: o.input.map((text) => ({ model: `models/${decodeURIComponent(m)}`, content: { parts: [{ text }] } })) }),
      timeoutMs: 60_000,
      userSignal: o.signal,
    });
    const j = await readJson<{ embeddings?: { values: number[] }[] }>(res);
    if (!Array.isArray(j.embeddings)) throw new AIError('MALFORMED_RESPONSE', 'embeddings');
    return j.embeddings.map((e) => e.values);
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const res = await aiFetch(`${this.base}/models?pageSize=200`, { headers: this.headers(), timeoutMs: 15_000, userSignal: signal });
    const j = await readJson<{ models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }>(res);
    if (!Array.isArray(j.models)) throw new AIError('MALFORMED_RESPONSE', 'models list');
    return j.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName }));
  }
}
