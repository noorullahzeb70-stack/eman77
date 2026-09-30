// Normalised AI errors. Provider-specific failures are mapped to these codes so
// the UI can show a friendly message and never leaks keys or internal details.

export type AIErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'CONTEXT_TOO_LONG'
  | 'CONTENT_FILTERED'
  | 'BAD_REQUEST'
  | 'NOT_SUPPORTED'
  | 'ABORTED';

export const AI_USER_MESSAGES: Record<AIErrorCode, string> = {
  NOT_CONFIGURED: 'Eman AI has not been set up yet. An administrator needs to add an AI provider.',
  INVALID_API_KEY: 'Eman AI is temporarily unavailable. The AI connection needs attention from an administrator.',
  RATE_LIMITED: 'Eman is receiving a lot of requests right now. Please wait a moment and try again.',
  QUOTA_EXCEEDED: 'Eman AI has reached its usage limit for now. Please try again later.',
  TIMEOUT: 'Eman took too long to respond. Please try again.',
  PROVIDER_UNAVAILABLE: 'Eman AI is temporarily unavailable. Please try again.',
  MALFORMED_RESPONSE: 'Eman received an unexpected response. Please try again.',
  NETWORK_ERROR: 'Eman AI could not be reached. Please try again.',
  MODEL_NOT_FOUND: 'The selected AI model is not available. Try another mode or contact an administrator.',
  CONTEXT_TOO_LONG: 'This conversation or file is too long for the AI. Try starting a new conversation or shortening the text.',
  CONTENT_FILTERED: 'Eman could not respond to that request.',
  BAD_REQUEST: 'Eman could not process that request. Please rephrase and try again.',
  NOT_SUPPORTED: 'This feature is not supported by the current AI provider.',
  ABORTED: 'Response stopped.',
};

/** Codes that are worth retrying automatically / offering a Retry button for. */
export const RETRYABLE: ReadonlySet<AIErrorCode> = new Set(['RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'MALFORMED_RESPONSE']);

export class AIError extends Error {
  readonly userMessage: string;
  readonly retryable: boolean;
  constructor(
    public readonly code: AIErrorCode,
    /** Internal detail for server logs / admin "test connection". Never includes the API key. */
    public readonly detail = '',
    public readonly httpStatus?: number,
    public readonly retryAfterSec?: number,
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
    this.userMessage = AI_USER_MESSAGES[code];
    this.retryable = RETRYABLE.has(code);
  }
}

/** Map an HTTP error response from any provider to an AIError. */
export function errorFromResponse(status: number, bodyText: string, retryAfter?: string | null): AIError {
  const body = bodyText.slice(0, 500).toLowerCase();
  const ra = retryAfter ? Number(retryAfter) || undefined : undefined;
  if (status === 401 || status === 403) return new AIError('INVALID_API_KEY', `HTTP ${status}`, status);
  if (status === 404) return new AIError('MODEL_NOT_FOUND', `HTTP 404: ${bodyText.slice(0, 200)}`, status);
  if (status === 429) {
    if (/quota|billing|insufficient|credit/.test(body)) return new AIError('QUOTA_EXCEEDED', `HTTP 429: ${bodyText.slice(0, 200)}`, status, ra);
    return new AIError('RATE_LIMITED', 'HTTP 429', status, ra);
  }
  if (status === 402) return new AIError('QUOTA_EXCEEDED', `HTTP 402`, status);
  if (status === 413 || /context|too long|too many tokens|maximum.*tokens|prompt is too long/.test(body)) {
    return new AIError('CONTEXT_TOO_LONG', `HTTP ${status}`, status);
  }
  if (status === 400 && /api key|api_key|invalid.*key/.test(body)) return new AIError('INVALID_API_KEY', `HTTP 400 key`, status);
  if (status >= 500 || status === 529) return new AIError('PROVIDER_UNAVAILABLE', `HTTP ${status}`, status, ra);
  return new AIError('BAD_REQUEST', `HTTP ${status}: ${bodyText.slice(0, 200)}`, status);
}

/** Map a thrown fetch/abort error to an AIError. */
export function errorFromThrown(e: unknown, userSignal?: AbortSignal): AIError {
  if (e instanceof AIError) return e;
  if (userSignal?.aborted) return new AIError('ABORTED');
  const name = (e as Error)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return new AIError('TIMEOUT', 'request timed out');
  if (e instanceof SyntaxError) return new AIError('MALFORMED_RESPONSE', e.message);
  return new AIError('NETWORK_ERROR', (e as Error)?.message ?? 'network error');
}
