import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button, Spinner } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { LogoMark } from '../components/ui/Logo.jsx';
import { Alert, Menu, Modal, ConfirmDialog, TypingIndicator, useToast, Badge } from '../components/ui/Primitives.jsx';
import { Field, Input } from '../components/ui/Form.jsx';
import { Link, useRouter } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { get, patch, del, post, streamChat, uploadFile } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.js';
import { usePageMeta, timeAgo, takePendingPrompt } from '../lib/meta.js';

const SUGGESTIONS = [
  { icon: 'lightbulb', text: 'Explain photosynthesis like I’m 12' },
  { icon: 'code', text: 'What is the difference between a list and a tuple in Python?' },
  { icon: 'calculator', text: 'Solve 2x² − 8x + 6 = 0 step by step' },
  { icon: 'feather', text: 'Help me write an introduction for an essay on climate change' },
];

const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/* ── Markdown message body with copy buttons on code blocks ── */
function MarkdownBody({ text, streaming }) {
  const ref = useRef(null);
  const html = useMemo(() => renderMarkdown(text), [text]);
  useEffect(() => {
    if (streaming || !ref.current) return;
    for (const block of ref.current.querySelectorAll('.code-block')) {
      if (block.querySelector('.code-copy')) continue;
      const b = document.createElement('button');
      b.className = 'code-copy';
      b.type = 'button';
      b.textContent = 'Copy';
      b.setAttribute('aria-label', 'Copy code');
      b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(block.querySelector('code')?.textContent ?? '');
          b.textContent = 'Copied';
          setTimeout(() => (b.textContent = 'Copy'), 1500);
        } catch { b.textContent = 'Copy failed'; }
      };
      block.appendChild(b);
    }
  }, [html, streaming]);
  return <div ref={ref} className={`md ${streaming ? 'md-streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function AttachmentChip({ a, onRemove }) {
  const isImg = a.kind === 'image' || a.mime?.startsWith('image/');
  return (
    <div className={`att-chip ${a.error ? 'att-error' : ''}`}>
      {isImg && (a.preview || a.id) ? <img src={a.preview || `/api/files/${a.id}`} alt="" /> : <Icon name={a.kind === 'pdf' ? 'file' : 'file'} />}
      <div className="att-meta">
        <span className="att-name">{a.name}</span>
        <span className="att-sub">{a.error ? a.error : a.uploading ? `Uploading ${a.progress ?? 0}%` : fmtSize(a.size)}</span>
      </div>
      {a.uploading && <Spinner />}
      {onRemove && <button className="att-x" aria-label={`Remove ${a.name}`} onClick={onRemove}><Icon name="x" size={14} /></button>}
    </div>
  );
}

function Message({ m, isLast, onRegenerate, onRetry, busy }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(m.content); toast('Copied to clipboard'); } catch { toast('Could not copy', 'error'); }
  };
  if (m.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-bubble">
          {m.attachments?.length > 0 && <div className="msg-atts">{m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}</div>}
          {m.content && <p className="msg-text">{m.content}</p>}
        </div>
        <span className="msg-time">{fmtTime(m.createdAt)}</span>
      </div>
    );
  }
  const streaming = m.status === 'streaming';
  return (
    <div className="msg msg-ai">
      <div className="msg-avatar"><LogoMark size={30} /></div>
      <div className="msg-main">
        {streaming && !m.content ? <TypingIndicator /> : m.content ? <MarkdownBody text={m.content} streaming={streaming} /> : null}
        {m.status === 'error' && (
          <Alert tone="danger" action={m.retryable !== false && <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry} disabled={busy}>Retry</Button>}>
            {m.errorMessage || 'Eman AI is temporarily unavailable. Please try again.'}
          </Alert>
        )}
        {m.notice && <p className="msg-notice"><Icon name="info" size={14} /> {m.notice}</p>}
        {!streaming && m.status !== 'error' && (
          <div className="msg-actions">
            {m.status === 'stopped' && <Badge tone="warning">Stopped</Badge>}
            <button className="icon-btn" onClick={copy} aria-label="Copy answer" title="Copy"><Icon name="copy" size={16} /></button>
            {isLast && <button className="icon-btn" onClick={onRegenerate} disabled={busy} aria-label="Regenerate answer" title="Regenerate"><Icon name="refresh" size={16} /></button>}
            <span className="msg-time">{fmtTime(m.createdAt)}{m.model ? ` · ${m.model}` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Conversation list (sidebar / mobile sheet) ── */
function ConversationList({ items, activeId, q, setQ, favOnly, setFavOnly, onPick, onAction, loading }) {
  const pinned = items.filter((c) => c.pinned);
  const rest = items.filter((c) => !c.pinned);
  const Item = (c) => (
    <li key={c.id} className={`conv-item ${c.id === activeId ? 'active' : ''}`}>
      <button className="conv-btn" onClick={() => onPick(c.id)} aria-current={c.id === activeId ? 'page' : undefined}>
        {c.favorite ? <Icon name="star" size={14} className="conv-star" /> : null}
        <span className="conv-title">{c.title}</span>
        <span className="conv-time">{timeAgo(c.updatedAt)}</span>
      </button>
      <Menu
        label={`Options for ${c.title}`}
        trigger={(p) => <button className="icon-btn conv-more" {...p}><Icon name="more" size={16} /></button>}
        items={[
          { label: 'Rename', icon: 'edit', onSelect: () => onAction('rename', c) },
          { label: c.pinned ? 'Unpin' : 'Pin', icon: 'pin', onSelect: () => onAction('pin', c) },
          { label: c.favorite ? 'Remove favourite' : 'Favourite', icon: 'star', onSelect: () => onAction('favorite', c) },
          'sep',
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => onAction('delete', c) },
        ]}
      />
    </li>
  );
  return (
    <div className="conv-list">
      <Input icon="search" type="search" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
      <div className="row" style={{ '--gap': '6px' }}>
        <button className="chip" aria-pressed={!favOnly} onClick={() => setFavOnly(false)}>All</button>
        <button className="chip" aria-pressed={favOnly} onClick={() => setFavOnly(true)}><Icon name="star" size={14} />Favourites</button>
      </div>
      <div className="conv-scroll">
        {loading ? <div className="center-pad"><Spinner /></div> : items.length === 0 ? (
          <p className="muted text-sm center-pad">{q ? 'No conversations match your search.' : 'No conversations yet.'}</p>
        ) : (
          <>
            {pinned.length > 0 && <><p className="conv-group">Pinned</p><ul>{pinned.map(Item)}</ul></>}
            {rest.length > 0 && <><p className="conv-group">{pinned.length ? 'Recent' : 'Conversations'}</p><ul>{rest.map(Item)}</ul></>}
          </>
        )}
      </div>
    </div>
  );
}

export default function Chat({ params }) {
  const { user } = useAuth();
  const { query, navigate, path } = useRouter();
  const toast = useToast();
  const convId = params?.id || null;

  const [status, setStatus] = useState(null); // AI status: tiers, ready
  const [tier, setTier] = useState(() => { try { return localStorage.getItem('eman-tier') || 'balanced'; } catch { return 'balanced'; } });
  const [convs, setConvs] = useState([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [text, setText] = useState('');
  const [atts, setAtts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preError, setPreError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [clearing, setClearing] = useState(false);

  const streamRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const autoSent = useRef(false);

  usePageMeta(conv?.title || 'Ask Eman');

  /* AI status */
  useEffect(() => {
    get('/api/ai/status').then((s) => {
      setStatus(s);
      if (s.tiers.length && !s.tiers.some((t) => t.id === tier)) setTier(s.tiers[0].id);
    }).catch(() => setStatus({ ready: false, tiers: [] }));
  }, []);
  useEffect(() => { try { localStorage.setItem('eman-tier', tier); } catch { /* ignore */ } }, [tier]);

  /* Conversation list (debounced search) */
  const loadConvs = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (favOnly) p.set('filter', 'favorites');
      const d = await get(`/api/conversations?${p}`);
      setConvs(d.items);
    } catch { /* keep previous list */ } finally { setConvsLoading(false); }
  }, [q, favOnly]);
  useEffect(() => { const t = setTimeout(loadConvs, q ? 250 : 0); return () => clearTimeout(t); }, [loadConvs]);

  /* Load selected conversation */
  useEffect(() => {
    if (streamRef.current) return; // don't clobber an in-flight stream that just created this conversation
    setPreError('');
    if (!convId) { setConv(null); setMessages([]); setLoadErr(''); return; }
    setLoadingConv(true);
    setLoadErr('');
    get(`/api/conversations/${convId}`)
      .then((d) => {
        setConv(d.conversation);
        setMessages(d.messages.map((m) => (m.status === 'error' ? { ...m, errorMessage: 'This answer failed. Press Retry to try again.' } : m)));
        if (status?.tiers?.some((t) => t.id === d.conversation.tier)) setTier(d.conversation.tier);
        stickRef.current = true;
      })
      .catch((e) => setLoadErr(e.status === 404 ? 'This conversation was not found. It may have been deleted.' : e.message))
      .finally(() => setLoadingConv(false));
  }, [convId]);

  /* New chat via ?new=1 */
  useEffect(() => {
    if (query.get('new') && !busy) {
      setConv(null); setMessages([]); setText(''); setAtts([]);
      navigate('/chat', { replace: true });
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [query]);

  /* Auto-scroll when near bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = scrollRef.current;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  /* Textarea autosize */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [text]);

  /* Attachments */
  const addFiles = (files) => {
    const list = [...files].slice(0, 6 - atts.length);
    for (const file of list) {
      const key = Math.random().toString(36).slice(2);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      const kind = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'text';
      if (file.size > 10 * 1024 * 1024) { toast(`${file.name} is larger than 10 MB`, 'error'); continue; }
      setAtts((a) => [...a, { key, name: file.name, size: file.size, kind, preview, uploading: true, progress: 0 }]);
      uploadFile(file, 'chat', (p) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((f) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, ...f, uploading: false } : x))))
        .catch((e) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, uploading: false, error: e.message } : x))));
    }
  };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  /* Sending */
  const run = useCallback((body, { optimisticUser } = {}) => {
    setBusy(true);
    setPreError('');
    stickRef.current = true;
    const placeholder = { id: `tmp-a-${Date.now()}`, role: 'assistant', content: '', status: 'streaming', createdAt: new Date().toISOString() };
    setMessages((ms) => [...ms, ...(optimisticUser ? [optimisticUser] : []), placeholder]);
    let aid = placeholder.id;
    let buffer = '';
    let raf = 0;
    const flush = () => { raf = 0; setMessages((ms) => ms.map((m) => (m.id === aid ? { ...m, content: buffer } : m))); };
    streamRef.current = streamChat(body, {
      onMeta: (meta) => {
        setConv(meta.conversation);
        const oldAid = aid;
        aid = meta.assistantMessageId;
        setMessages((ms) => ms.map((m) => (m.id === oldAid ? { ...m, id: aid, model: meta.model } : optimisticUser && m.id === optimisticUser.id && meta.userMessageId ? { ...m, id: meta.userMessageId } : m)));
        if (!convId || convId !== meta.conversation.id) navigate(`/chat/${meta.conversation.id}`, { replace: !convId });
        loadConvs();
      },
      onDelta: ({ text: t }) => { buffer += t; if (!raf) raf = requestAnimationFrame(flush); },
      onNotice: ({ message }) => setMessages((ms) => ms.map((m) => (m.id === aid ? { ...m, notice: message } : m))),
      onDone: () => {
        cancelAnimationFrame(raf);
        setMessages((ms) => ms.map((m) => (m.id === aid ? { ...m, content: buffer, status: 'complete' } : m)));
        streamRef.current = null; setBusy(false); loadConvs();
      },
      onStopped: () => {
        cancelAnimationFrame(raf);
        setMessages((ms) => ms.map((m) => (m.id === aid ? { ...m, content: buffer, status: 'stopped' } : m)));
        streamRef.current = null; setBusy(false); loadConvs();
      },
      onError: (e) => {
        cancelAnimationFrame(raf);
        streamRef.current = null; setBusy(false);
        if (e.preflight) {
          // Request was rejected before anything was saved: remove optimistic messages, restore input.
          setMessages((ms) => ms.filter((m) => m.id !== aid && m.id !== optimisticUser?.id));
          if (optimisticUser) { setText(optimisticUser.content); }
          setPreError(e.fields ? Object.values(e.fields)[0] : e.message);
          return;
        }
        setMessages((ms) => ms.map((m) => (m.id === aid ? { ...m, content: buffer, status: 'error', errorMessage: e.message, retryable: e.retryable } : m)));
      },
    });
  }, [convId, loadConvs, navigate]);

  const send = (override) => {
    const content = (override ?? text).trim();
    const ready = atts.filter((a) => a.id && !a.error);
    if (busy || (!content && !ready.length)) return;
    if (atts.some((a) => a.uploading)) { toast('Please wait for uploads to finish', 'info'); return; }
    const userMsg = { id: `tmp-u-${Date.now()}`, role: 'user', content, attachments: ready.map(({ id, name, mime, kind, size }) => ({ id, name, mime, kind, size })), createdAt: new Date().toISOString(), status: 'complete' };
    run({ conversationId: conv?.id, content, tier, attachments: ready.map((a) => a.id) }, { optimisticUser: userMsg });
    setText('');
    setAtts([]);
  };

  const regenerate = () => {
    if (busy || !conv) return;
    setMessages((ms) => {
      const copy = [...ms];
      while (copy.length && copy.at(-1).role === 'assistant') copy.pop();
      return copy;
    });
    run({ conversationId: conv.id, regenerate: true, tier });
  };

  const stop = () => streamRef.current?.abort();

  /* Auto-send ?prompt= (from Education and Study Tools) */
  const pending = useRef(null);
  useEffect(() => {
    if (query.get('start') && pending.current === null) pending.current = takePendingPrompt() || '';
    const p = query.get('prompt') || pending.current;
    if (p && status?.ready && !autoSent.current) {
      autoSent.current = true;
      navigate('/chat', { replace: true });
      setConv(null); setMessages([]);
      setTimeout(() => send(p), 0);
    } else if (p && status && !status.ready) {
      setText(p);
    }
  }, [status, query]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(min-width: 768px)').matches) {
      e.preventDefault();
      send();
    }
  };

  /* Conversation actions */
  const onAction = async (kind, c) => {
    if (kind === 'rename') { setRenaming(c); setRenameVal(c.title); return; }
    if (kind === 'delete') { setDeleting(c); return; }
    try {
      const d = await patch(`/api/conversations/${c.id}`, kind === 'pin' ? { pinned: !c.pinned } : { favorite: !c.favorite });
      if (conv?.id === c.id) setConv(d.conversation);
      toast(kind === 'pin' ? (c.pinned ? 'Unpinned' : 'Pinned') : c.favorite ? 'Removed from favourites' : 'Added to favourites');
      loadConvs();
    } catch (e) { toast(e.message, 'error'); }
  };
  const doRename = async (e) => {
    e?.preventDefault();
    if (!renameVal.trim()) return;
    try {
      const d = await patch(`/api/conversations/${renaming.id}`, { title: renameVal.trim() });
      if (conv?.id === renaming.id) setConv(d.conversation);
      setRenaming(null); toast('Conversation renamed'); loadConvs();
    } catch (x) { toast(x.message, 'error'); }
  };
  const doDelete = async () => {
    try {
      await del(`/api/conversations/${deleting.id}`);
      if (conv?.id === deleting.id) { setConv(null); setMessages([]); navigate('/chat', { replace: true }); }
      setDeleting(null); toast('Conversation deleted'); loadConvs();
    } catch (x) { toast(x.message, 'error'); }
  };
  const doClear = async () => {
    try {
      await post(`/api/conversations/${conv.id}/clear`);
      setMessages([]); setClearing(false); toast('Conversation cleared');
    } catch (x) { toast(x.message, 'error'); }
  };

  const pick = (id) => { setSheet(false); if (!busy) navigate(`/chat/${id}`); };
  const lastAssistantIdx = messages.map((m) => m.role).lastIndexOf('assistant');
  const notReady = status && !status.ready;

  return (
    <AppLayout bare>
      <div className="chat">
        <aside className="chat-side" aria-label="Conversations">
          <Button icon="plus" block onClick={() => navigate('/chat?new=1')} disabled={busy}>New chat</Button>
          <ConversationList items={convs} activeId={conv?.id} q={q} setQ={setQ} favOnly={favOnly} setFavOnly={setFavOnly} onPick={pick} onAction={onAction} loading={convsLoading} />
        </aside>

        {sheet && (
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Conversations">
            <div className="drawer-backdrop" onClick={() => setSheet(false)} />
            <div className="drawer-panel drawer-left">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <p className="cap-title">Conversations</p>
                <Button variant="ghost" iconOnly icon="x" aria-label="Close" onClick={() => setSheet(false)} />
              </div>
              <Button icon="plus" block onClick={() => { setSheet(false); navigate('/chat?new=1'); }} disabled={busy}>New chat</Button>
              <ConversationList items={convs} activeId={conv?.id} q={q} setQ={setQ} favOnly={favOnly} setFavOnly={setFavOnly} onPick={pick} onAction={onAction} loading={convsLoading} />
            </div>
          </div>
        )}

        <section
          className={`chat-main ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <header className="chat-head">
            <button className="icon-btn chat-list-btn" onClick={() => setSheet(true)} aria-label="Show conversations"><Icon name="list" /></button>
            <div className="chat-head-title">
              <h1>{conv?.title || 'New conversation'}</h1>
              {conv?.pinned && <Icon name="pin" size={14} />}
            </div>
            {status?.tiers?.length > 1 && (
              <div className="tier-switch" role="radiogroup" aria-label="Answer mode">
                {status.tiers.map((t) => (
                  <button key={t.id} role="radio" aria-checked={tier === t.id} className="tier-opt" onClick={() => setTier(t.id)} disabled={busy}>
                    <Icon name={t.id === 'fast' ? 'zap' : t.id === 'advanced' ? 'sparkles' : 'target'} size={14} /><span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
            {conv && (
              <Menu
                label="Conversation options"
                trigger={(p) => <button className="icon-btn" {...p}><Icon name="more" /></button>}
                items={[
                  { label: 'Rename', icon: 'edit', onSelect: () => onAction('rename', conv) },
                  { label: conv.pinned ? 'Unpin' : 'Pin', icon: 'pin', onSelect: () => onAction('pin', conv) },
                  { label: conv.favorite ? 'Remove favourite' : 'Favourite', icon: 'star', onSelect: () => onAction('favorite', conv) },
                  { label: 'Clear messages', icon: 'refresh', onSelect: () => setClearing(true) },
                  'sep',
                  { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDeleting(conv) },
                ]}
              />
            )}
          </header>

          <div className="chat-scroll" ref={scrollRef} onScroll={onScroll} aria-live="polite" aria-busy={busy}>
            <div className="chat-thread">
              {loadingConv ? (
                <div className="center-pad"><Spinner label="Loading conversation" /></div>
              ) : loadErr ? (
                <div className="state state-error"><div className="state-icon"><Icon name="alert-circle" /></div><p className="state-title">{loadErr}</p><Button href="/chat?new=1" variant="secondary">Start a new chat</Button></div>
              ) : messages.length === 0 ? (
                <div className="chat-welcome animate-in">
                  <LogoMark size={64} />
                  <h2 className="display">How can I help you learn today, {user.name.split(' ')[0]}?</h2>
                  {notReady ? (
                    <Alert tone="warning" title="Eman AI isn’t connected yet" action={user.role === 'admin' ? <Button size="sm" href="/admin/ai">Set up AI</Button> : <Button size="sm" variant="secondary" href="/settings#ai-key">Use my own key</Button>}>
                      {user.role === 'admin' ? 'Add your AI provider’s API key in Admin → AI Settings to start chatting.' : 'The administrator is setting up the AI service. You can also connect your own API key in Settings.'}
                    </Alert>
                  ) : (
                    <div className="suggest-grid">
                      {SUGGESTIONS.map((s) => (
                        <button key={s.text} className="suggest card card-interactive" onClick={() => send(s.text)} disabled={busy || !status}>
                          <Icon name={s.icon} /><span>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                messages.map((m, i) => (
                  <Message key={m.id} m={m} isLast={i === lastAssistantIdx && i === messages.length - 1} onRegenerate={regenerate} onRetry={regenerate} busy={busy} />
                ))
              )}
            </div>
          </div>

          <div className="composer-wrap">
            {preError && <Alert tone="danger" action={<button className="icon-btn" aria-label="Dismiss" onClick={() => setPreError('')}><Icon name="x" size={16} /></button>}>{preError}</Alert>}
            <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              {atts.length > 0 && (
                <div className="composer-atts">
                  {atts.map((a) => <AttachmentChip key={a.key} a={a} onRemove={() => setAtts((x) => x.filter((y) => y.key !== a.key))} />)}
                </div>
              )}
              <div className="composer-row">
                <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach image, PDF or text file" disabled={busy || notReady}>
                  <Icon name="paperclip" />
                </button>
                <input ref={fileRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,.py,.js,.ts,.html,.css,.c,.cpp,.h,.java,.sql" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                <label htmlFor="composer-input" className="sr-only">Message Eman</label>
                <textarea
                  id="composer-input"
                  ref={taRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  placeholder={notReady ? 'Eman AI is not connected yet' : 'Ask Eman anything…'}
                  disabled={notReady}
                  maxLength={24000}
                  autoFocus
                />
                {busy ? (
                  <button type="button" className="send-btn stop" onClick={stop} aria-label="Stop generating"><Icon name="stop" /></button>
                ) : (
                  <button type="submit" className="send-btn" disabled={notReady || (!text.trim() && !atts.some((a) => a.id))} aria-label="Send message"><Icon name="send" /></button>
                )}
              </div>
            </form>
            <p className="composer-hint">Eman can make mistakes. Check important information. <span className="hide-mobile">· Enter to send, Shift+Enter for a new line · Drop files to attach</span></p>
          </div>
          {dragging && <div className="drop-overlay"><Icon name="upload" size={40} /><p>Drop files to attach</p></div>}
        </section>
      </div>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation" footer={<><Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={doRename}>Save</Button></>}>
        <form onSubmit={doRename}><Field label="Title">{(p) => <Input {...p} value={renameVal} maxLength={120} onChange={(e) => setRenameVal(e.target.value)} autoFocus />}</Field></form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete conversation?" message={`“${deleting?.title}” and all its messages will be permanently deleted.`} confirmLabel="Delete" danger />
      <ConfirmDialog open={clearing} onClose={() => setClearing(false)} onConfirm={doClear} title="Clear all messages?" message="The conversation stays in your list, but all its messages will be removed." confirmLabel="Clear" danger />
    </AppLayout>
  );
}
