// Conversations, streaming chat, uploads and file serving.
import type { Router, Ctx } from '../lib/router.ts';
import type { Deps } from '../types.ts';
import { requireAuth } from '../middleware/auth.ts';
import { Validator, rules } from '../lib/validate.ts';
import { newId, nowIso } from '../db/index.ts';
import { Errors, AppError } from '../lib/http.ts';
import { AIError, type ChatMessage } from '../ai/index.ts';
import { resolveAI, aiStatus, enforceAILimits, recordUsage, systemPrompt, getLimits, TIERS, type Tier } from '../services/ai.ts';
import { saveUpload, getFile, readFileData } from '../services/files.ts';
import { getSetting } from '../services/settings.ts';
import { log } from '../lib/logger.ts';

interface Attachment { id: string; name: string; mime: string; kind: 'image' | 'pdf' | 'text'; size: number }
interface MsgRow { id: string; conversation_id: string; role: 'user' | 'assistant'; content: string; attachments: string; status: string; error_code: string | null; model: string | null; created_at: string }
interface ConvRow { id: string; user_id: string; title: string; model_tier: Tier; pinned: number; favorite: number; last_message_at: string | null; created_at: string; updated_at: string }

const convOut = (c: ConvRow) => ({
  id: c.id, title: c.title, tier: c.model_tier, pinned: !!c.pinned, favorite: !!c.favorite, updatedAt: c.updated_at, createdAt: c.created_at,
});
const msgOut = (m: MsgRow) => ({
  id: m.id, role: m.role, content: m.content, attachments: JSON.parse(m.attachments) as Attachment[], status: m.status, errorCode: m.error_code, model: m.model, createdAt: m.created_at,
});

function ownConversation(d: Deps, ctx: Ctx, id: string) {
  const c = d.db.get<ConvRow>('SELECT * FROM conversations WHERE id = ?', [id]);
  // 404 (not 403) so other users' conversation ids can't be probed.
  if (!c || c.user_id !== ctx.user!.id) throw Errors.notFound('Conversation not found.');
  return c;
}

function indexConversation(d: Deps, convId: string, userId: string) {
  const text = d.db.all<{ content: string }>('SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at', [convId]).map((m) => m.content).join('\n').slice(0, 50_000);
  const title = d.db.get<{ title: string }>('SELECT title FROM conversations WHERE id = ?', [convId])?.title ?? '';
  d.db.run('DELETE FROM conversation_search WHERE conversation_id = ?', [convId]);
  d.db.run('INSERT INTO conversation_search (conversation_id, user_id, content) VALUES (?, ?, ?)', [convId, userId, `${title}\n${text}`]);
}

/** Make an FTS5 query safe: quote each word as a prefix term. */
export function ftsQuery(q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return words.map((w) => `"${w}"*`).join(' ');
}

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'New conversation';
  return t.length > 60 ? `${t.slice(0, 57).replace(/\s+\S*$/, '')}…` : t;
}

/** Build the message history sent to the AI, newest-first until the character budget is used. */
function buildHistory(d: Deps, convId: string, maxChars: number): ChatMessage[] {
  const rows = d.db.all<MsgRow>("SELECT * FROM messages WHERE conversation_id = ? AND status IN ('complete', 'stopped') ORDER BY created_at DESC LIMIT 60", [convId]);
  const out: ChatMessage[] = [];
  let used = 0;
  let imagesLeft = 4; // only attach images from the most recent messages
  for (const r of rows) {
    if (!r.content.trim() && r.role === 'assistant') continue;
    const msg: ChatMessage = { role: r.role, content: r.content };
    const atts = JSON.parse(r.attachments) as Attachment[];
    for (const a of atts) {
      const f = getFile(d, a.id);
      if (!f) continue;
      const data = readFileData(d, f);
      if (!data) continue;
      if (a.kind === 'image' && imagesLeft > 0) {
        imagesLeft--;
        (msg.images ??= []).push({ mimeType: f.mime_type as 'image/webp', dataBase64: data.toString('base64') });
      } else if (a.kind === 'text') {
        (msg.documents ??= []).push({ name: a.name, mimeType: 'text/plain', text: data.toString('utf8').slice(0, maxChars) });
      } else if (a.kind === 'pdf') {
        (msg.documents ??= []).push({ name: a.name, mimeType: 'application/pdf', dataBase64: data.toString('base64') });
      }
    }
    const size = msg.content.length + (msg.documents?.reduce((s, x) => s + (x.text?.length ?? 20_000), 0) ?? 0);
    if (used + size > maxChars && out.length > 0) break;
    used += size;
    out.push(msg);
  }
  out.reverse();
  // Providers require the conversation to start with a user message and alternate roles.
  while (out.length && out[0]!.role !== 'user') out.shift();
  const merged: ChatMessage[] = [];
  for (const m of out) {
    const prev = merged.at(-1);
    if (prev && prev.role === m.role) {
      prev.content += `\n\n${m.content}`;
      if (m.images) (prev.images ??= []).push(...m.images);
      if (m.documents) (prev.documents ??= []).push(...m.documents);
    } else merged.push({ ...m });
  }
  return merged;
}

export function chatRoutes(api: Router, d: Deps) {
  api.get('/api/ai/status', (ctx) => aiStatus(d, ctx.user?.id ?? null));

  /* ── Conversations ── */
  api.get('/api/conversations', requireAuth, (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim().slice(0, 100);
    const filter = ctx.query.get('filter');
    let rows: ConvRow[];
    if (q) {
      const fq = ftsQuery(q);
      rows = fq
        ? d.db.all<ConvRow>(
            `SELECT c.* FROM conversations c WHERE c.user_id = ? AND (c.title LIKE ? OR c.id IN (SELECT conversation_id FROM conversation_search WHERE conversation_search MATCH ? AND user_id = ?))
             ORDER BY c.pinned DESC, c.updated_at DESC LIMIT 100`, [ctx.user!.id, `%${q}%`, fq, ctx.user!.id])
        : [];
    } else {
      rows = d.db.all<ConvRow>(
        `SELECT * FROM conversations WHERE user_id = ? ${filter === 'favorites' ? 'AND favorite = 1' : ''} ORDER BY pinned DESC, updated_at DESC LIMIT 200`, [ctx.user!.id]);
    }
    return { items: rows.map(convOut) };
  });

  api.post('/api/conversations', requireAuth, async (ctx) => {
    const b = await ctx.json();
    const v = new Validator();
    const title = v.check('title', b.title, rules.string({ max: 120, optional: true, label: 'Title' }));
    const tier = b.tier ? v.check('tier', b.tier, rules.oneOf(TIERS, 'Mode')) : 'balanced';
    v.done();
    const id = newId('c_');
    d.db.run('INSERT INTO conversations (id, user_id, title, model_tier) VALUES (?, ?, ?, ?)', [id, ctx.user!.id, title || 'New conversation', tier]);
    ctx.res.statusCode = 201;
    return { conversation: convOut(d.db.get<ConvRow>('SELECT * FROM conversations WHERE id = ?', [id])!) };
  });

  api.get('/api/conversations/:id', requireAuth, (ctx) => {
    const c = ownConversation(d, ctx, ctx.params.id!);
    const messages = d.db.all<MsgRow>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at', [c.id]);
    return { conversation: convOut(c), messages: messages.map(msgOut) };
  });

  api.patch('/api/conversations/:id', requireAuth, async (ctx) => {
    const c = ownConversation(d, ctx, ctx.params.id!);
    const b = await ctx.json();
    const v = new Validator();
    const title = b.title !== undefined ? v.check('title', b.title, rules.string({ min: 1, max: 120, label: 'Title' })) : c.title;
    const tier = b.tier !== undefined ? v.check('tier', b.tier, rules.oneOf(TIERS, 'Mode')) : c.model_tier;
    v.done();
    const pinned = b.pinned !== undefined ? (b.pinned ? 1 : 0) : c.pinned;
    const favorite = b.favorite !== undefined ? (b.favorite ? 1 : 0) : c.favorite;
    d.db.run('UPDATE conversations SET title = ?, model_tier = ?, pinned = ?, favorite = ? WHERE id = ?', [title, tier, pinned, favorite, c.id]);
    if (title !== c.title) indexConversation(d, c.id, c.user_id);
    return { conversation: convOut(d.db.get<ConvRow>('SELECT * FROM conversations WHERE id = ?', [c.id])!) };
  });

  api.delete('/api/conversations/:id', requireAuth, (ctx) => {
    const c = ownConversation(d, ctx, ctx.params.id!);
    d.db.tx(() => {
      d.db.run('DELETE FROM conversation_search WHERE conversation_id = ?', [c.id]);
      d.db.run('DELETE FROM conversations WHERE id = ?', [c.id]);
    });
    return { deleted: true };
  });

  api.post('/api/conversations/:id/clear', requireAuth, (ctx) => {
    const c = ownConversation(d, ctx, ctx.params.id!);
    d.db.run('DELETE FROM messages WHERE conversation_id = ?', [c.id]);
    d.db.run('UPDATE conversations SET updated_at = ?, last_message_at = NULL WHERE id = ?', [nowIso(), c.id]);
    indexConversation(d, c.id, c.user_id);
    return { cleared: true };
  });

  /* ── Uploads ── */
  api.post('/api/uploads', requireAuth, async (ctx) => {
    d.limiter.hit(`upload:${ctx.user!.id}`, 30, 10 * 60 * 1000, 'Too many uploads. Please wait a few minutes.');
    const limits = getSetting(d.db, 'uploads.limits', { chatAttachmentMaxMB: 10, imageMaxMB: 8 });
    const purpose = ctx.query.get('purpose') ?? 'chat';
    if (purpose !== 'chat' && purpose !== 'avatar') throw Errors.badRequest('Invalid upload purpose.');
    const maxBytes = (purpose === 'avatar' ? limits.imageMaxMB : limits.chatAttachmentMaxMB) * 1024 * 1024;
    let name = 'file';
    try { name = decodeURIComponent(String(ctx.req.headers['x-file-name'] ?? 'file')); } catch { /* keep default */ }
    const buf = await ctx.rawBody(maxBytes);
    const saved = await saveUpload(d, {
      buf, name, purpose, ownerId: ctx.user!.id, maxBytes,
      allow: purpose === 'avatar' ? ['image'] : ['image', 'pdf', 'text'],
    });
    if (purpose === 'avatar') {
      d.db.run('UPDATE users SET avatar_file_id = ?, updated_at = ? WHERE id = ?', [saved.id, nowIso(), ctx.user!.id]);
    }
    ctx.res.statusCode = 201;
    return { file: saved };
  });

  api.get('/api/files/:id', (ctx) => {
    const f = getFile(d, ctx.params.id!);
    if (!f) throw Errors.notFound('File not found.');
    const isPublic = ['avatar', 'gallery', 'book_cover', 'branding', 'education', 'book_document'].includes(f.purpose);
    if (!isPublic && (!ctx.user || (ctx.user.id !== f.owner_id && ctx.user.role !== 'admin'))) throw Errors.notFound('File not found.');
    const data = readFileData(d, f);
    if (!data) throw Errors.notFound('File not found.');
    const inline = f.mime_type.startsWith('image/') || f.mime_type === 'application/pdf';
    const download = ctx.query.get('download') === '1';
    ctx.res.writeHead(200, {
      'Content-Type': f.mime_type === 'text/plain' ? 'text/plain; charset=utf-8' : f.mime_type,
      'Content-Length': data.length,
      'Cache-Control': isPublic ? 'public, max-age=86400' : 'private, max-age=3600',
      'Content-Disposition': `${inline && !download ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'file')}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    });
    ctx.res.end(data);
  });

  /* ── Chat (streaming via Server-Sent Events) ── */
  api.post('/api/chat/stream', requireAuth, async (ctx) => {
    const res = ctx.res;
    const b = await ctx.json(256 * 1024);
    const userId = ctx.user!.id;
    const limits = getLimits(d);
    const v = new Validator();
    const regenerate = b.regenerate === true;
    const content = regenerate ? '' : v.check('content', b.content ?? '', rules.string({ max: limits.maxInputChars, optional: true, multiline: true, label: 'Message' }));
    const tier = v.check('tier', b.tier ?? 'balanced', rules.oneOf(TIERS, 'Mode'));
    const attIds: string[] = Array.isArray(b.attachments) ? (b.attachments as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
    v.done();
    if (!regenerate && !content && attIds.length === 0) throw Errors.validation({ content: 'Type a message or attach a file.' });

    // Resolve provider & enforce limits before creating anything.
    let resolved;
    try {
      resolved = resolveAI(d, userId, tier);
    } catch (e) {
      if (e instanceof AIError) throw new AppError(503, e.code, e.userMessage);
      throw e;
    }
    enforceAILimits(d, userId, resolved.keySource);

    // Conversation
    let conv: ConvRow;
    if (b.conversationId) conv = ownConversation(d, ctx, String(b.conversationId));
    else {
      const id = newId('c_');
      d.db.run('INSERT INTO conversations (id, user_id, title, model_tier) VALUES (?, ?, ?, ?)', [id, userId, titleFrom(content || 'File question'), tier]);
      conv = d.db.get<ConvRow>('SELECT * FROM conversations WHERE id = ?', [id])!;
    }

    // Attachments must belong to this user.
    const attachments: Attachment[] = [];
    for (const id of attIds) {
      const f = getFile(d, id);
      if (!f || f.owner_id !== userId || f.purpose !== 'chat') throw Errors.badRequest('One of the attached files is not available.');
      const kind = f.mime_type.startsWith('image/') ? 'image' : f.mime_type === 'application/pdf' ? 'pdf' : 'text';
      if (kind === 'pdf' && (resolved.kind === 'openai' || resolved.kind === 'openai-compatible')) {
        throw Errors.validation({ attachments: 'PDF reading needs the Claude or Gemini provider. Paste the text instead, or attach a .txt file.' });
      }
      attachments.push({ id: f.id, name: f.original_name ?? 'file', mime: f.mime_type, kind, size: f.size_bytes });
    }

    let userMessageId: string | null = null;
    if (regenerate) {
      // Remove the last assistant reply (and any failed ones) so it can be generated again.
      const last = d.db.get<MsgRow>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1', [conv.id]);
      if (!last) throw Errors.badRequest('Nothing to regenerate yet.');
      if (last.role === 'assistant') d.db.run('DELETE FROM messages WHERE id = ?', [last.id]);
      d.db.run("DELETE FROM messages WHERE conversation_id = ? AND role = 'assistant' AND status = 'error'", [conv.id]);
    } else {
      userMessageId = newId('m_');
      d.db.run('INSERT INTO messages (id, conversation_id, role, content, attachments) VALUES (?, ?, ?, ?, ?)', [userMessageId, conv.id, 'user', content, JSON.stringify(attachments)]);
      if (conv.title === 'New conversation') d.db.run('UPDATE conversations SET title = ? WHERE id = ?', [titleFrom(content || attachments[0]?.name || 'File question'), conv.id]);
    }

    const history = buildHistory(d, conv.id, limits.maxInputChars);
    if (!history.length) throw Errors.badRequest('Nothing to send.');
    const assistantId = newId('m_');
    // Keep the assistant message slightly after the user message for stable ordering.
    d.db.run("INSERT INTO messages (id, conversation_id, role, content, status, model, created_at) VALUES (?, ?, 'assistant', '', 'streaming', ?, ?)",
      [assistantId, conv.id, resolved.model, new Date(Date.now() + 5).toISOString()]);
    d.db.run('UPDATE conversations SET updated_at = ?, last_message_at = ?, model_tier = ? WHERE id = ?', [nowIso(), nowIso(), tier, conv.id]);

    // Start SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const updated = d.db.get<ConvRow>('SELECT * FROM conversations WHERE id = ?', [conv.id])!;
    send('meta', { conversation: convOut(updated), userMessageId, assistantMessageId: assistantId, model: resolved.model, tier: resolved.tier });

    const ac = new AbortController();
    const onClose = () => { if (!res.writableEnded) ac.abort(); };
    res.on('close', onClose);
    const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15_000);

    const started = performance.now();
    let text = '';
    let lastFlush = Date.now();
    let usage = { inputTokens: 0, outputTokens: 0 };
    let status: 'ok' | 'error' | 'stopped' = 'ok';
    let errCode: string | undefined;
    try {
      for await (const ev of resolved.provider.streamResponse({
        model: resolved.model,
        system: systemPrompt(d, ctx.user!.name),
        messages: history,
        maxTokens: limits.maxOutputTokens,
        signal: ac.signal,
        timeoutMs: 90_000,
      })) {
        if (ev.type === 'text') {
          text += ev.text;
          send('delta', { text: ev.text });
          // Persist partial text periodically so a crash doesn't lose everything.
          if (Date.now() - lastFlush > 2000) {
            d.db.run('UPDATE messages SET content = ? WHERE id = ?', [text, assistantId]);
            lastFlush = Date.now();
          }
        } else {
          usage = ev.usage;
          if (ev.finishReason === 'length') send('notice', { message: 'The answer reached the length limit. Ask Eman to “continue” for more.' });
          if (ev.finishReason === 'filtered' && !text) {
            throw new AIError('CONTENT_FILTERED');
          }
        }
      }
      d.db.run("UPDATE messages SET content = ?, status = 'complete', tokens_in = ?, tokens_out = ? WHERE id = ?", [text, usage.inputTokens, usage.outputTokens, assistantId]);
      send('done', { messageId: assistantId, usage });
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('PROVIDER_UNAVAILABLE', (e as Error)?.message);
      if (err.code === 'ABORTED') {
        status = 'stopped';
        d.db.run("UPDATE messages SET content = ?, status = 'stopped' WHERE id = ?", [text, assistantId]);
        send('stopped', { messageId: assistantId });
      } else {
        status = 'error';
        errCode = err.code;
        log.warn('ai request failed', { code: err.code, detail: err.detail, provider: resolved.kind, model: resolved.model });
        d.db.run("UPDATE messages SET content = ?, status = 'error', error_code = ? WHERE id = ?", [text, err.code, assistantId]);
        send('error', { code: err.code, message: err.userMessage, retryable: err.retryable, messageId: assistantId });
      }
    } finally {
      clearInterval(keepAlive);
      res.off('close', onClose);
      recordUsage(d, {
        userId, conversationId: conv.id, kind: resolved.kind, model: resolved.model, keySource: resolved.keySource,
        tokensIn: usage.inputTokens, tokensOut: usage.outputTokens, latencyMs: Math.round(performance.now() - started), status, errorCode: errCode,
      });
      d.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [nowIso(), conv.id]);
      indexConversation(d, conv.id, userId);
      if (!res.writableEnded) res.end();
    }
  });

  /* ── Non-streaming chat (for integrations / simple clients) ── */
  api.post('/api/chat', requireAuth, async (ctx) => {
    const b = await ctx.json(64 * 1024);
    const limits = getLimits(d);
    const v = new Validator();
    const content = v.check('content', b.content, rules.string({ min: 1, max: limits.maxInputChars, multiline: true, label: 'Message' }));
    const tier = v.check('tier', b.tier ?? 'balanced', rules.oneOf(TIERS, 'Mode'));
    v.done();
    let resolved;
    try { resolved = resolveAI(d, ctx.user!.id, tier); } catch (e) {
      if (e instanceof AIError) throw new AppError(503, e.code, e.userMessage);
      throw e;
    }
    enforceAILimits(d, ctx.user!.id, resolved.keySource);
    const started = performance.now();
    try {
      const r = await resolved.provider.generateResponse({ model: resolved.model, system: systemPrompt(d, ctx.user!.name), messages: [{ role: 'user', content }], maxTokens: limits.maxOutputTokens, timeoutMs: 90_000 });
      recordUsage(d, { userId: ctx.user!.id, kind: resolved.kind, model: resolved.model, keySource: resolved.keySource, tokensIn: r.usage.inputTokens, tokensOut: r.usage.outputTokens, latencyMs: Math.round(performance.now() - started), status: 'ok' });
      return { text: r.text, model: r.model, usage: r.usage };
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('PROVIDER_UNAVAILABLE');
      recordUsage(d, { userId: ctx.user!.id, kind: resolved.kind, model: resolved.model, keySource: resolved.keySource, tokensIn: 0, tokensOut: 0, latencyMs: Math.round(performance.now() - started), status: 'error', errorCode: err.code });
      throw new AppError(err.code === 'RATE_LIMITED' ? 429 : 502, err.code, err.userMessage);
    }
  });
}
