// Provider factory. The AI service (Phase 6) picks credentials in this order:
//   1. the user's own key (if the admin allows "bring your own key"),
//   2. the active provider saved in Admin → AI Settings (key encrypted in DB),
//   3. AI_PROVIDER / AI_API_KEY / AI_MODEL from the environment.
import type { AIProvider, AIProviderKind, ProviderCredentials } from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { OpenAIProvider } from './providers/openai.ts';
import { GeminiProvider } from './providers/gemini.ts';
import { AIError } from './errors.ts';

export const PROVIDER_INFO: Record<AIProviderKind, { label: string; needsBaseUrl: boolean; keyHint: string; docsUrl: string }> = {
  anthropic: { label: 'Anthropic (Claude)', needsBaseUrl: false, keyHint: 'Starts with sk-ant-', docsUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', needsBaseUrl: false, keyHint: 'Starts with sk-', docsUrl: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google Gemini', needsBaseUrl: false, keyHint: 'From Google AI Studio', docsUrl: 'https://aistudio.google.com/app/apikey' },
  'openai-compatible': { label: 'OpenAI-compatible (Groq, OpenRouter, local…)', needsBaseUrl: true, keyHint: 'Key from your provider', docsUrl: '' },
};

export function createProvider(kind: AIProviderKind, creds: ProviderCredentials): AIProvider {
  if (!creds.apiKey?.trim() && kind !== 'openai-compatible') throw new AIError('NOT_CONFIGURED', 'missing API key');
  switch (kind) {
    case 'anthropic':
      return new AnthropicProvider(creds);
    case 'openai':
      return new OpenAIProvider(creds, 'openai');
    case 'openai-compatible':
      return new OpenAIProvider(creds, 'openai-compatible');
    case 'gemini':
      return new GeminiProvider(creds);
    default:
      throw new AIError('NOT_CONFIGURED', `unknown provider ${String(kind)}`);
  }
}

export * from './types.ts';
export * from './errors.ts';
