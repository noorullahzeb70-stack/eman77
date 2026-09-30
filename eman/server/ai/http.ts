// Shared HTTP helpers for AI providers: timeouts, error mapping, SSE parsing.
import { AIError, errorFromResponse, errorFromThrown } from './errors.ts';

const DEFAULT_TIMEOUT = 90_000;

/** fetch with a timeout merged with the caller's abort signal; maps failures to AIError. */
export async function aiFetch(url: string, init: RequestInit & { timeoutMs?: number; userSignal?: AbortSignal }): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, userSignal, ...rest } = init;
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (userSignal) signals.push(userSignal);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.any(signals) });
  } catch (e) {
    throw errorFromThrown(e, userSignal);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw errorFromResponse(res.status, text, res.headers.get('retry-after'));
  }
  return res;
}

export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AIError('MALFORMED_RESPONSE', `non-JSON response (${text.slice(0, 80)})`);
  }
}

/**
 * Parse a Server-Sent Events body into { event, data } records.
 * Applies an idle timeout: if no bytes arrive for `idleMs`, throws TIMEOUT.
 */
export async function* parseSSE(res: Response, opts: { idleMs?: number; userSignal?: AbortSignal } = {}): AsyncGenerator<{ event: string; data: string }> {
  if (!res.body) throw new AIError('MALFORMED_RESPONSE', 'empty stream body');
  const idleMs = opts.idleMs ?? 60_000;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = 'message';
  let data: string[] = [];

  const readWithIdle = async () => {
    let timer: NodeJS.Timeout | undefined;
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AIError('TIMEOUT', 'stream idle timeout')), idleMs);
    });
    try {
      return await Promise.race([reader.read(), idle]);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    while (true) {
      if (opts.userSignal?.aborted) throw new AIError('ABORTED');
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readWithIdle();
      } catch (e) {
        throw errorFromThrown(e, opts.userSignal);
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = 'message';
          data = [];
        } else if (line.startsWith(':')) {
          // comment / keep-alive
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    reader.cancel().catch(() => {});
  }
}

export function parseJsonEvent<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    throw new AIError('MALFORMED_RESPONSE', 'bad stream event JSON');
  }
}

/** Convert documents with extracted text into a text block the model can read. */
export function documentsAsText(docs: { name: string; text?: string }[] | undefined) {
  if (!docs?.length) return '';
  return docs
    .filter((d) => d.text)
    .map((d) => `\n\n<document name="${d.name.replace(/"/g, "'")}">\n${d.text}\n</document>`)
    .join('');
}
