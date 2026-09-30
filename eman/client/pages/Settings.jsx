import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, Alert, Avatar, Tabs, useToast, ConfirmDialog, EmptyState, Skeleton } from '../components/ui/Primitives.jsx';
import { Field, Input, PasswordInput, Textarea, Select } from '../components/ui/Form.jsx';
import { ThemeSegmented } from '../components/ui/ThemeToggle.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.js';
import { get, put, patch, del, post, uploadFile } from '../lib/api.js';
import { Link } from '../lib/router.jsx';
import { usePageMeta, timeAgo } from '../lib/meta.js';

const LANGS = [['en', 'English'], ['ar', 'العربية (Arabic)'], ['ur', 'اردو (Urdu)'], ['hi', 'हिन्दी (Hindi)'], ['bn', 'বাংলা (Bengali)'], ['fr', 'Français'], ['es', 'Español'], ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu']];
export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', hint: 'Key starts with sk-ant-', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', hint: 'Key starts with sk-', url: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', hint: 'Get a key in Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
  { id: 'openai-compatible', label: 'Other (OpenAI-compatible)', hint: 'Groq, OpenRouter, Together, local server…', url: '' },
];

function ProfileTab() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, bio: user.bio, language: user.language });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const { pref } = useTheme();
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const d = await put('/api/user/profile', { ...f, theme: pref });
      updateUser(d.user);
      toast('Profile saved');
    } catch (x) { setErrors(x.fields || {}); if (!x.fields) toast(x.message, 'error'); } finally { setSaving(false); }
  };
  const onAvatar = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file, 'avatar');
      const d = await get('/api/user/profile');
      updateUser(d.user);
      toast('Profile photo updated');
    } catch (x) { toast(x.message, 'error'); } finally { setUploading(false); }
  };
  return (
    <Card>
      <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={save}>
        <div className="row" style={{ '--gap': 'var(--space-4)' }}>
          <Avatar name={user.name} src={user.avatarUrl} size={72} />
          <div className="stack" style={{ '--gap': 'var(--space-2)' }}>
            <Button variant="secondary" size="sm" icon="upload" loading={uploading} onClick={() => fileRef.current?.click()}>Change photo</Button>
            <span className="text-xs subtle">JPG, PNG or WEBP, up to 8 MB</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="grid" style={{ '--min': '240px' }}>
          <Field label="Full name" error={errors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />}</Field>
          <Field label="Email" hint={user.emailVerified ? 'Verified' : 'Not verified yet'}>{(p) => <Input {...p} value={user.email} disabled />}</Field>
        </div>
        <Field label="Bio" error={errors.bio} hint={`${(f.bio || '').length}/500`}>{(p) => <Textarea {...p} rows={3} value={f.bio || ''} maxLength={500} placeholder="Tell us a little about what you study or teach." onChange={(e) => setF({ ...f, bio: e.target.value })} />}</Field>
        <Field label="Preferred language" hint="Eman replies in the language you write in.">
          {(p) => <Select {...p} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </Card>
  );
}

function AppearanceTab() {
  const { pref } = useTheme();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    patch('/api/user/theme', { theme: pref }).catch(() => {});
  }, [pref]);
  return (
    <Card className="stack">
      <h2 className="card-title">Theme</h2>
      <p className="muted text-sm">Choose light, dark, or follow your device. Your choice is saved to your account.</p>
      <ThemeSegmented />
    </Card>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.currentPassword) er.currentPassword = 'Enter your current password.';
    if (f.newPassword.length < 8) er.newPassword = 'At least 8 characters.';
    if (f.newPassword !== f.confirmPassword) er.confirmPassword = 'Passwords do not match.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await put('/api/user/password', f);
      setF({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast('Password changed. Other devices were signed out.');
    } catch (x) { setErrors(x.fields || {}); if (!x.fields) toast(x.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Card>
      <form className="stack" style={{ '--gap': 'var(--space-4)', maxWidth: 440 }} onSubmit={save}>
        <h2 className="card-title">Change password</h2>
        <Field label="Current password" error={errors.currentPassword}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />}</Field>
        <Field label="New password" error={errors.newPassword}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />}</Field>
        <Field label="Confirm new password" error={errors.confirmPassword}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} />}</Field>
        <div><Button type="submit" loading={saving}>Update password</Button></div>
      </form>
    </Card>
  );
}

function AIKeyTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [f, setF] = useState({ provider: 'anthropic', apiKey: '', model: '', baseUrl: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const load = () => get('/api/user/ai-key/current').then(setData).catch(() => setData({ allowed: false, key: null }));
  useEffect(() => { load(); }, []);
  const prov = PROVIDERS.find((p) => p.id === f.provider);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({});
    try {
      await put('/api/user/ai-key', f);
      toast('Your API key was verified and saved');
      setF({ ...f, apiKey: '' });
      load();
    } catch (x) { setErrors(x.fields || {}); if (!x.fields) toast(x.message, 'error'); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await del('/api/user/ai-key'); setRemoving(false); toast('Personal key removed'); load(); } catch (x) { toast(x.message, 'error'); }
  };
  if (!data) return <Card><Skeleton height={120} /></Card>;
  if (!data.allowed) return <Card><EmptyState icon="lock" title="Personal API keys are turned off." text="The administrator provides the AI service for everyone." /></Card>;
  return (
    <Card className="stack" id="ai-key">
      <h2 className="card-title">Your own AI key <span className="badge">Optional</span></h2>
      <p className="muted text-sm">Connect your own AI provider account. Your requests then use your key and don’t count toward the daily limit. The key is checked, encrypted, and never shown again — only its last 4 characters.</p>
      {data.key && (
        <Alert tone="success" title="Personal key active" action={<Button size="sm" variant="secondary" onClick={() => setRemoving(true)}>Remove</Button>}>
          {PROVIDERS.find((p) => p.id === data.key.provider)?.label} · key ending <strong>{data.key.last4}</strong> · model <code>{data.key.model}</code> · updated {timeAgo(data.key.updatedAt)}
        </Alert>
      )}
      <form className="stack" style={{ '--gap': 'var(--space-4)' }} onSubmit={save} autoComplete="off">
        <Field label="Provider">{(p) => <Select {...p} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>}</Field>
        {f.provider === 'openai-compatible' && <Field label="Base URL" error={errors.baseUrl} hint="e.g. https://api.groq.com/openai/v1">{(p) => <Input {...p} value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} />}</Field>}
        <Field label={data.key ? 'Replace API key' : 'API key'} error={errors.apiKey} hint={<>{prov?.hint}{prov?.url && <> · <a href={prov.url} target="_blank" rel="noopener noreferrer">Get a key</a></>}</>}>
          {(p) => <PasswordInput {...p} autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="Paste your key" />}
        </Field>
        <Field label="Model" error={errors.model} hint="The exact model name from your provider’s documentation.">{(p) => <Input {...p} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="Model name" />}</Field>
        <div><Button type="submit" icon="key" loading={saving}>Verify & save key</Button></div>
      </form>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} title="Remove your API key?" message="Eman will use the platform’s AI service again." confirmLabel="Remove" danger />
    </Card>
  );
}

export default function Settings() {
  usePageMeta('Settings');
  const [tab, setTab] = useState(() => (location.hash === '#ai-key' ? 'ai' : 'profile'));
  return (
    <AppLayout>
      <div className="app-page-head"><h1 className="app-title">Settings</h1></div>
      <div className="stack" style={{ '--gap': 'var(--space-5)', maxWidth: 820 }}>
        <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[{ value: 'profile', label: 'Profile' }, { value: 'appearance', label: 'Appearance' }, { value: 'security', label: 'Security' }, { value: 'ai', label: 'AI key' }]} />
        <div role="tabpanel">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'ai' && <AIKeyTab />}
        </div>
      </div>
    </AppLayout>
  );
}

export function Notifications() {
  usePageMeta('Notifications');
  const toast = useToast();
  const [d, setD] = useState(null);
  const load = () => get('/api/notifications').then(setD).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);
  const readAll = async () => { await post('/api/notifications/read-all'); load(); };
  const read = async (n) => { if (!n.read_at) { await post(`/api/notifications/${n.id}/read`); load(); } };
  const remove = async (n) => { await del(`/api/notifications/${n.id}`); load(); };
  const icon = { system: 'info', account: 'user', resource: 'book-open', announcement: 'bell' };
  return (
    <AppLayout>
      <div className="app-page-head row" style={{ justifyContent: 'space-between' }}>
        <h1 className="app-title">Notifications</h1>
        {d?.unread > 0 && <Button size="sm" variant="secondary" icon="check" onClick={readAll}>Mark all as read</Button>}
      </div>
      <Card style={{ padding: 0, maxWidth: 820 }}>
        {!d ? <div style={{ padding: 'var(--space-6)' }}><Skeleton height={60} /></div> : d.items.length === 0 ? (
          <EmptyState icon="bell" title="No notifications" text="Updates about your account and new resources will appear here." />
        ) : (
          <ul className="notif-list">
            {d.items.map((n) => (
              <li key={n.id} className={`notif ${n.read_at ? '' : 'unread'}`}>
                <div className="icon-tile sm"><Icon name={icon[n.type] || 'bell'} /></div>
                <div className="list-body" onClick={() => read(n)}>
                  <p className="list-title">{n.title}</p>
                  {n.body && <p className="list-sub" style={{ whiteSpace: 'normal' }}>{n.body}</p>}
                  <p className="text-xs subtle">{timeAgo(n.created_at)}{n.link && <> · <Link to={n.link} onClick={() => read(n)}>Open</Link></>}</p>
                </div>
                {!n.read_at && <button className="icon-btn" onClick={() => read(n)} aria-label="Mark as read" title="Mark as read"><Icon name="check" size={16} /></button>}
                <button className="icon-btn" onClick={() => remove(n)} aria-label="Delete notification" title="Delete"><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}
