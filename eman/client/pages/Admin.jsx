import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, Alert, Badge, Modal, ConfirmDialog, useToast, Skeleton, EmptyState, Tabs } from '../components/ui/Primitives.jsx';
import { Field, Input, PasswordInput, Textarea, Select, Switch } from '../components/ui/Form.jsx';
import { Link, useRouter } from '../lib/router.jsx';
import { get, post, put, del, patch } from '../lib/api.js';
import { usePageMeta, timeAgo } from '../lib/meta.js';
import { PROVIDERS } from './Settings.jsx';

const TIERS = [
  { id: 'fast', label: 'Fast', hint: 'Quick everyday answers (a smaller, cheaper model)' },
  { id: 'balanced', label: 'Balanced', hint: 'Default for most questions' },
  { id: 'advanced', label: 'Advanced', hint: 'Hard problems, long documents (the most capable model)' },
];

function AdminNav() {
  return (
    <div className="chip-row" style={{ marginBottom: 'var(--space-5)' }}>
      <Link to="/admin" className="chip" activeExact>Overview</Link>
      <Link to="/admin/ai" className="chip">AI Settings</Link>
    </div>
  );
}

/** Model picker: dropdown of live models from the provider, with a manual option. */
function ModelSelect({ models, value, onChange, label, hint, id }) {
  const [manual, setManual] = useState(value && models.length > 0 && !models.some((m) => m.id === value));
  if (!models.length || manual) {
    return (
      <Field label={label} hint={hint} id={id}>
        {(p) => <Input {...p} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Model name (leave empty to skip)" />}
      </Field>
    );
  }
  return (
    <Field label={label} hint={<>{hint} · <button type="button" className="link-btn" onClick={() => setManual(true)}>type a name</button></>} id={id}>
      {(p) => (
        <Select {...p} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Not used —</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.label ? `${m.label} (${m.id})` : m.id}</option>)}
        </Select>
      )}
    </Field>
  );
}

function AddProvider({ onDone, hasProviders }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ provider: 'anthropic', label: '', apiKey: '', baseUrl: '', models: {} });
  const [models, setModels] = useState([]);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const prov = PROVIDERS.find((p) => p.id === f.provider);

  const test = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr({});
    try {
      const d = await post('/api/admin/ai/test-key', { provider: f.provider, apiKey: f.apiKey, baseUrl: f.baseUrl });
      setModels(d.models);
      setStep(2);
      toast(`Connected — ${d.models.length} models available`);
    } catch (x) { setErr(x.fields || { apiKey: x.message }); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setErr({});
    try {
      await post('/api/admin/ai/providers', { ...f, activate: true });
      toast('AI provider saved and activated');
      onDone();
    } catch (x) { setErr(x.fields || { models: x.message }); } finally { setBusy(false); }
  };
  const anyModel = Object.values(f.models).some(Boolean);

  return (
    <Card className="stack add-provider">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="card-title">{hasProviders ? 'Add another AI provider' : 'Connect your AI provider'}</h2>
        <div className="steps-mini"><span data-on={step >= 1}>1 Key</span><span data-on={step >= 2}>2 Models</span></div>
      </div>
      {step === 1 && (
        <form className="stack" style={{ '--gap': 'var(--space-4)' }} onSubmit={test} autoComplete="off">
          <div className="provider-pick" role="radiogroup" aria-label="Provider">
            {PROVIDERS.map((p) => (
              <button type="button" key={p.id} role="radio" aria-checked={f.provider === p.id} className="provider-opt" onClick={() => setF({ ...f, provider: p.id })}>
                <strong>{p.label}</strong><span>{p.hint}</span>
              </button>
            ))}
          </div>
          {f.provider === 'openai-compatible' && (
            <Field label="Base URL" error={err.baseUrl} hint="The provider’s OpenAI-compatible API address, e.g. https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1">
              {(p) => <Input {...p} value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="https://…/v1" />}
            </Field>
          )}
          <Field label="API key" error={err.apiKey} hint={<>Paste the whole key. It is encrypted and never shown again.{prov?.url && <> · <a href={prov.url} target="_blank" rel="noopener noreferrer">Where do I get a key?</a></>}</>}>
            {(p) => <PasswordInput {...p} autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="Paste your API key here" />}
          </Field>
          <div className="row"><Button type="submit" icon="zap" loading={busy} disabled={!f.apiKey.trim() && f.provider !== 'openai-compatible'}>Test connection</Button></div>
        </form>
      )}
      {step === 2 && (
        <div className="stack" style={{ '--gap': 'var(--space-4)' }}>
          <Alert tone="success" title="Key works">Choose which model powers each answer mode. You need at least one — pick <strong>Balanced</strong> if unsure.</Alert>
          {TIERS.map((t) => (
            <ModelSelect key={t.id} id={`m-${t.id}`} label={t.label} hint={t.hint} models={models} value={f.models[t.id]} onChange={(v) => setF({ ...f, models: { ...f.models, [t.id]: v } })} />
          ))}
          <Field label="Name (optional)" hint="Shown only to admins, e.g. “Claude — main key”">{(p) => <Input {...p} value={f.label} maxLength={60} onChange={(e) => setF({ ...f, label: e.target.value })} />}</Field>
          {err.models && <Alert tone="danger">{err.models}</Alert>}
          {err.apiKey && <Alert tone="danger">{err.apiKey}</Alert>}
          <div className="row">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button icon="check" onClick={save} loading={busy} disabled={!anyModel}>Save & activate</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProviderCard({ p, onChanged }) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [keyErr, setKeyErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [m, setM] = useState(p.models);

  const test = async () => {
    setTesting(true); setResult(null);
    try { setResult(await post(`/api/admin/ai/providers/${p.id}/test`)); onChanged(); } catch (x) { setResult({ ok: false, error: x.message }); } finally { setTesting(false); }
  };
  const replaceKey = async () => {
    setBusy(true); setKeyErr('');
    try {
      await put(`/api/admin/ai/providers/${p.id}`, { apiKey: newKey });
      toast('API key replaced'); setKeyOpen(false); setNewKey(''); onChanged();
    } catch (x) { setKeyErr(x.fields?.apiKey || x.message); } finally { setBusy(false); }
  };
  const openModels = async () => {
    setModelsOpen(true); setM(p.models); setLive(null);
    try { setLive((await get(`/api/admin/ai/providers/${p.id}/models`)).models); } catch { setLive([]); }
  };
  const saveModels = async () => {
    setBusy(true);
    try { await put(`/api/admin/ai/providers/${p.id}`, { models: m }); toast('Models updated'); setModelsOpen(false); onChanged(); } catch (x) { toast(x.fields?.models || x.message, 'error'); } finally { setBusy(false); }
  };
  const activate = async () => { try { await post(`/api/admin/ai/providers/${p.id}/activate`); toast(`${p.label} is now active`); onChanged(); } catch (x) { toast(x.message, 'error'); } };
  const remove = async () => { try { await del(`/api/admin/ai/providers/${p.id}`); toast('Provider removed'); setConfirmDel(false); onChanged(); } catch (x) { toast(x.message, 'error'); } };

  return (
    <Card className={`provider-card ${p.active ? 'is-active' : ''}`}>
      <div className="provider-card-head">
        <div className="icon-tile"><Icon name="cpu" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="cap-title">{p.label} {p.active && <Badge tone="success" dot>Active</Badge>}</p>
          <p className="muted text-sm">{p.providerLabel} · key <code>••••{p.keyLast4}</code>{p.baseUrl && <> · <span className="break">{p.baseUrl}</span></>}</p>
        </div>
      </div>
      <div className="model-tags">
        {TIERS.map((t) => (
          <div key={t.id} className="model-tag"><span>{t.label}</span><code>{p.models[t.id] || '—'}</code></div>
        ))}
      </div>
      {p.lastTestAt && !result && (
        <p className="text-xs subtle">Last test {timeAgo(p.lastTestAt)}: {p.lastTestOk ? '✅ working' : '❌ failed'}</p>
      )}
      {result && (result.ok
        ? <Alert tone="success" title={`Working · ${result.latencyMs} ms`}>Eman replied: “{result.reply}”</Alert>
        : <Alert tone="danger" title="Test failed">{result.error}</Alert>)}
      <div className="row" style={{ '--gap': 'var(--space-2)' }}>
        <Button size="sm" variant="soft" icon="zap" onClick={test} loading={testing}>Test</Button>
        <Button size="sm" variant="secondary" icon="key" onClick={() => setKeyOpen(true)}>Change key</Button>
        <Button size="sm" variant="secondary" icon="settings" onClick={openModels}>Models</Button>
        {!p.active && <Button size="sm" icon="check" onClick={activate}>Activate</Button>}
        <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirmDel(true)} aria-label={`Delete ${p.label}`} />
      </div>

      <Modal open={keyOpen} onClose={() => setKeyOpen(false)} title="Change API key" footer={<><Button variant="secondary" onClick={() => setKeyOpen(false)}>Cancel</Button><Button onClick={replaceKey} loading={busy} disabled={newKey.trim().length < 8}>Test & save</Button></>}>
        <div className="stack">
          <p className="muted text-sm">Paste the new key for <strong>{p.label}</strong>. It is tested first — the old key keeps working until the new one passes.</p>
          <Field label="New API key" error={keyErr}>{(pp) => <PasswordInput {...pp} autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} autoFocus />}</Field>
        </div>
      </Modal>
      <Modal open={modelsOpen} onClose={() => setModelsOpen(false)} title="Choose models" footer={<><Button variant="secondary" onClick={() => setModelsOpen(false)}>Cancel</Button><Button onClick={saveModels} loading={busy}>Save</Button></>}>
        {live === null ? <Skeleton height={160} /> : (
          <div className="stack">
            {live.length === 0 && <Alert tone="warning">Couldn’t load the model list — type model names instead.</Alert>}
            {TIERS.map((t) => <ModelSelect key={t.id} id={`e-${p.id}-${t.id}`} label={t.label} hint={t.hint} models={live} value={m[t.id]} onChange={(v) => setM({ ...m, [t.id]: v })} />)}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={remove} title="Delete this provider?" message={p.active ? 'This is the active provider — Eman will stop answering until another provider is activated.' : 'The saved key will be permanently deleted.'} confirmLabel="Delete" danger />
    </Card>
  );
}

function BehaviourSettings({ settings, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(settings);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(settings), [settings]);
  const setL = (k) => (e) => setF({ ...f, limits: { ...f.limits, [k]: Number(e.target.value) } });
  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({});
    try { await put('/api/admin/ai/settings', f); toast('AI settings saved'); onSaved(); } catch (x) { setErrors(x.fields || {}); toast(x.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Card>
      <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={save}>
        <div>
          <h2 className="card-title">Eman’s personality (system prompt)</h2>
          <p className="muted text-sm">Instructions Eman follows in every conversation.</p>
        </div>
        <Field label="System prompt" error={errors.systemPrompt} hint={`${f.systemPrompt.length}/12000`}>
          {(p) => <Textarea {...p} rows={12} value={f.systemPrompt} onChange={(e) => setF({ ...f, systemPrompt: e.target.value })} style={{ fontSize: 'var(--text-sm)', lineHeight: 1.55 }} />}
        </Field>
        <div>
          <h3 className="cap-title">Limits</h3>
          <p className="muted text-sm">Protect your API budget. Users with their own key are exempt from the daily limit.</p>
        </div>
        <div className="grid" style={{ '--min': '200px' }}>
          <Field label="AI requests per user per day" error={errors.requestsPerUserPerDay}>{(p) => <Input {...p} type="number" min={1} value={f.limits.requestsPerUserPerDay} onChange={setL('requestsPerUserPerDay')} />}</Field>
          <Field label="Requests per minute" error={errors.requestsPerMinute}>{(p) => <Input {...p} type="number" min={1} value={f.limits.requestsPerMinute} onChange={setL('requestsPerMinute')} />}</Field>
          <Field label="Max input (characters)" error={errors.maxInputChars}>{(p) => <Input {...p} type="number" min={1000} value={f.limits.maxInputChars} onChange={setL('maxInputChars')} />}</Field>
          <Field label="Max answer length (tokens)" error={errors.maxOutputTokens}>{(p) => <Input {...p} type="number" min={64} value={f.limits.maxOutputTokens} onChange={setL('maxOutputTokens')} />}</Field>
        </div>
        <Switch label="Allow users to add their own API key" checked={f.allowUserKeys} onChange={(v) => setF({ ...f, allowUserKeys: v })} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="submit" loading={saving}>Save settings</Button></div>
      </form>
    </Card>
  );
}

function Usage({ data }) {
  const totals = useMemo(() => data.usage.reduce((a, r) => ({ req: a.req + r.requests, err: a.err + r.errors, tok: a.tok + (r.tokens_in || 0) + (r.tokens_out || 0) }), { req: 0, err: 0, tok: 0 }), [data]);
  const max = Math.max(1, ...data.usage.map((u) => u.requests));
  return (
    <Card className="stack">
      <h2 className="card-title">Usage · last 30 days</h2>
      <div className="stat-row">
        <div className="stat"><span className="stat-n">{totals.req}</span><span className="stat-l">Requests</span></div>
        <div className="stat"><span className="stat-n">{totals.err}</span><span className="stat-l">Errors</span></div>
        <div className="stat"><span className="stat-n">{totals.tok.toLocaleString()}</span><span className="stat-l">Tokens</span></div>
      </div>
      {data.usage.length > 0 ? (
        <div className="usage-bars wide" role="img" aria-label="Daily AI requests">
          {data.usage.map((u) => (
            <div key={u.day} className="usage-bar" title={`${u.day}: ${u.requests} requests, ${u.errors} errors`}>
              <span className="usage-bar-fill" style={{ height: `${Math.max(4, (u.requests / max) * 100)}%` }} />
              <span className="usage-bar-label">{u.day.slice(8)}</span>
            </div>
          ))}
        </div>
      ) : <p className="muted text-sm">No AI requests yet.</p>}
      {data.byModel.length > 0 && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Model</th><th>Provider</th><th>Requests</th><th>Tokens</th></tr></thead>
          <tbody>{data.byModel.map((r) => <tr key={r.provider + r.model}><td><code>{r.model}</code></td><td>{r.provider}</td><td>{r.requests}</td><td>{(r.tokens || 0).toLocaleString()}</td></tr>)}</tbody>
        </table></div>
      )}
      {data.errors.length > 0 && <p className="text-sm muted">Errors: {data.errors.map((e) => `${e.error_code} ×${e.n}`).join(' · ')}</p>}
    </Card>
  );
}

export function AdminAI() {
  usePageMeta('AI Settings · Admin');
  const { query } = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('providers');
  const load = () => get('/api/admin/ai').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  return (
    <AppLayout>
      <div className="app-page-head"><h1 className="app-title">AI Settings</h1><p className="muted">Connect an AI provider, change API keys any time, and control how Eman behaves.</p></div>
      <AdminNav />
      {query.get('welcome') && data && data.providers.length === 0 && (
        <Alert tone="info" title="Welcome, administrator 👋">You created the first account, so you manage EMAN. Paste your AI provider’s API key below to switch Eman on — it takes one minute.</Alert>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
      {!data ? <Skeleton height={240} /> : (
        <div className="stack" style={{ '--gap': 'var(--space-5)', marginTop: 'var(--space-4)' }}>
          <Tabs label="AI settings" value={tab} onChange={setTab} tabs={[{ value: 'providers', label: 'Providers & keys' }, { value: 'behaviour', label: 'Personality & limits' }, { value: 'usage', label: 'Usage' }]} />
          {tab === 'providers' && (
            <>
              {data.providers.length === 0 && data.envFallback && (
                <Alert tone="info">Currently using <strong>{data.envFallback.provider}</strong> / <code>{data.envFallback.model}</code> from the server’s environment variables. A provider added here takes priority.</Alert>
              )}
              {data.providers.map((p) => <ProviderCard key={p.id} p={p} onChanged={load} />)}
              <AddProvider key={data.providers.length} hasProviders={data.providers.length > 0} onDone={load} />
            </>
          )}
          {tab === 'behaviour' && <BehaviourSettings settings={data.settings} onSaved={load} />}
          {tab === 'usage' && <Usage data={data} />}
        </div>
      )}
    </AppLayout>
  );
}

export function AdminHome() {
  usePageMeta('Admin');
  const [d, setD] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [err, setErr] = useState('');
  const load = () => {
    get('/api/admin/overview').then(setD).catch((e) => setErr(e.message));
    get('/api/admin/contact').then((r) => setMsgs(r.items)).catch(() => {});
  };
  useEffect(load, []);
  const mark = async (m, status) => { await patch(`/api/admin/contact/${m.id}`, { status }); load(); };
  const stats = d ? [
    ['Users', d.users, 'users'], ['New (7 days)', d.newUsers7d, 'user'], ['Active (7 days)', d.activeUsers7d, 'zap'],
    ['Conversations', d.conversations, 'chat'], ['AI requests (24 h)', d.aiRequests24h, 'sparkles'], ['AI errors (24 h)', d.aiErrors24h, 'alert'],
    ['Uploads', d.uploads, 'upload'], ['New messages', d.contactNew, 'mail'],
  ] : [];
  return (
    <AppLayout>
      <div className="app-page-head"><h1 className="app-title">Admin</h1><p className="muted">Real-time overview of EMAN.</p></div>
      <AdminNav />
      {err && <Alert tone="danger">{err}</Alert>}
      {d && !d.aiConfigured && <Alert tone="warning" title="AI is not connected" action={<Button size="sm" href="/admin/ai">Connect now</Button>}>Users can’t chat until you add an AI provider.</Alert>}
      <div className="grid" style={{ '--min': '170px', marginTop: 'var(--space-4)' }}>
        {!d ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={96} radius="var(--radius-lg)" />) : stats.map(([l, n, i]) => (
          <Card key={l} className="stat-card"><Icon name={i} /><span className="stat-n">{n}</span><span className="stat-l">{l}</span></Card>
        ))}
      </div>
      <div className="dash-grid" style={{ marginTop: 'var(--space-5)' }}>
        <Card className="stack">
          <h2 className="card-title">Contact messages</h2>
          {msgs.length === 0 ? <p className="muted text-sm">No messages yet.</p> : (
            <ul className="list">
              {msgs.slice(0, 20).map((m) => (
                <li key={m.id} className="list-item contact-msg">
                  <span className={`dot ${m.status === 'new' ? 'dot-on' : ''}`} />
                  <div className="list-body">
                    <p className="list-title">{m.subject}</p>
                    <p className="list-sub" style={{ whiteSpace: 'normal' }}>{m.message}</p>
                    <p className="text-xs subtle">{m.name} · <a href={`mailto:${m.email}`}>{m.email}</a> · {timeAgo(m.created_at)}</p>
                  </div>
                  {m.status === 'new' ? <Button size="sm" variant="ghost" onClick={() => mark(m, 'read')}>Mark read</Button> : <Badge>{m.status}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="stack">
          <h2 className="card-title">Recent activity</h2>
          {!d ? <Skeleton height={100} /> : d.recentLogs.length === 0 ? <p className="muted text-sm">No activity yet.</p> : (
            <ul className="list">
              {d.recentLogs.map((l, i) => (
                <li key={i} className="list-item"><div className="icon-tile sm"><Icon name="shield" /></div><div className="list-body"><p className="list-title">{l.action.replace(/[._]/g, ' ')}</p><p className="list-sub">{l.actor || 'System'}</p></div><span className="text-xs subtle">{timeAgo(l.created_at)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="notice-card" style={{ marginTop: 'var(--space-5)' }}>
        <Icon name="info" />
        <div><p style={{ fontWeight: 700 }}>Coming in the next phases</p><p className="muted text-sm">User management, books, gallery and education content editors, branding and announcements.</p></div>
      </Card>
    </AppLayout>
  );
}
