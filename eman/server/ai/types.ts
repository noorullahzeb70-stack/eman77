// AI provider abstraction. Every cloud provider implements this interface, so the
// rest of EMAN never depends on one vendor. Add a provider = add one file.

export type AIProviderKind = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

export interface ImageInput { mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; dataBase64: string }
export interface DocumentInput { name: string; mimeType: string; text?: string; dataBase64?: string }

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ImageInput[];
  documents?: DocumentInput[];
}

export interface GenerateOptions {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Abort signal (user pressed Stop, client disconnected). */
  signal?: AbortSignal;
  /** Overall timeout for non-streaming calls, or idle timeout between stream chunks (ms). */
  timeoutMs?: number;
}

export interface Usage { inputTokens: number; outputTokens: number }

export interface GenerateResult {
  text: string;
  model: string;
  usage: Usage;
  finishReason: 'stop' | 'length' | 'filtered' | 'other';
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: Usage; finishReason: GenerateResult['finishReason']; model: string };

export interface ProviderModel { id: string; label?: string }

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
}

export interface AIProvider {
  readonly kind: AIProviderKind;
  generateResponse(opts: GenerateOptions): Promise<GenerateResult>;
  streamResponse(opts: GenerateOptions): AsyncGenerator<StreamEvent>;
  analyzeImage(opts: Omit<GenerateOptions, 'messages'> & { prompt: string; image: ImageInput }): Promise<GenerateResult>;
  analyzeDocument(opts: Omit<GenerateOptions, 'messages'> & { prompt: string; document: DocumentInput }): Promise<GenerateResult>;
  generateEmbedding(opts: { model: string; input: string[]; signal?: AbortSignal }): Promise<number[][]>;
  /** Lists models the key can use — powers "Test connection" and the model picker (no hard-coded model names). */
  listModels(signal?: AbortSignal): Promise<ProviderModel[]>;
}
