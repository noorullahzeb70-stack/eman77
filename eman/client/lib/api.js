// API client: consistent JSON handling, CSRF header, friendly network errors, SSE chat streaming.
let csrfToken = null;
export const setCsrf = (t) => { csrfToken = t; };

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

const OFFLINE_MSG = 'Please check your internet connection.';

export async function api(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (csrfToken && method !== 'GET') headers['x-csrf-token'] = csrfToken;
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', navigator.onLine ? 'Could not reach EMAN. Please try again.' : OFFLINE_MSG);
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !json?.success) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code || 'ERROR', err?.message || 'Something went wrong. Please try again.', err?.fields);
  }
  return json.data;
}

export const get = (u, o) => api('GET', u, undefined, o);
export const post = (u, b, o) => api('POST', u, b ?? {}, o);
export const put = (u, b, o) => api('PUT', u, b ?? {}, o);
export const patch = (u, b, o) => api('PATCH', u, b ?? {}, o);
export const del = (u, o) => api('DELETE', u, undefined, o);

/** Upload a file with progress (XHR gives upload progress events). */
export function uploadFile(file, purpose = 'chat', onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?purpose=${purpose}`);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let j = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && j?.success) resolve(j.data.file);
      else reject(new ApiError(xhr.status, j?.error?.code || 'UPLOAD_FAILED', j?.error?.message || 'Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', OFFLINE_MSG));
    xhr.send(file);
  });
}

/**
 * Stream a chat reply. Calls handlers.onMeta / onDelta / onDone / onError / onStopped / onNotice.
 * Returns an AbortController-like { abort }.
 */
export function streamChat(body, handlers) {
  const ac = new AbortController();
  (async () => {
    let res;
    try {
      res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify(body),
        signal: ac.signal,
        credentials: 'same-origin',
      });
    } catch (e) {
      if (e.name === 'AbortError') return handlers.onStopped?.();
      return handlers.onError?.({ code: 'NETWORK_ERROR', message: navigator.onLine ? 'Eman AI could not be reached. Please try again.' : OFFLINE_MSG, retryable: true });
    }
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
      let j = null;
      try { j = await res.json(); } catch { /* ignore */ }
      return handlers.onError?.({
        code: j?.error?.code || 'ERROR',
        message: j?.error?.message || 'Eman AI is temporarily unavailable. Please try again.',
        fields: j?.error?.fields,
        retryable: res.status >= 500 || res.status === 429,
        preflight: true,
      });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let event = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }
          const h = { meta: handlers.onMeta, delta: handlers.onDelta, done: handlers.onDone, error: handlers.onError, stopped: handlers.onStopped, notice: handlers.onNotice }[event];
          h?.(parsed);
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return handlers.onStopped?.();
      handlers.onError?.({ code: 'NETWORK_ERROR', message: 'The connection was interrupted. Please retry.', retryable: true });
    }
  })();
  return { abort: () => ac.abort() };
}
