import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Logo, LogoMark } from '../components/ui/Logo.jsx';
import { Alert } from '../components/ui/Primitives.jsx';
import { Field, Input, PasswordInput, Checkbox } from '../components/ui/Form.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { Link, useRouter } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { post } from '../lib/api.js';
import { usePageMeta } from '../lib/meta.js';

function safeNext(q) {
  const n = q.get('next') || '/dashboard';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-side" aria-hidden="true">
        <div className="auth-side-inner">
          <LogoMark size={64} />
          <p className="display auth-quote">“Seek knowledge from the cradle to the grave.”</p>
          <ul className="auth-points">
            <li><Icon name="sparkles" /> Ask Eman anything, any time</li>
            <li><Icon name="lightbulb" /> Quizzes, flashcards & study plans</li>
            <li><Icon name="book-open" /> A growing library by subject</li>
            <li><Icon name="shield" /> Private and secure</li>
          </ul>
        </div>
      </aside>
      <main id="main" className="auth-main">
        <div className="auth-top">
          <Link to="/" className="brand" aria-label="EMAN home"><Logo size={30} /></Link>
          <ThemeToggle />
        </div>
        <div className="auth-card animate-in">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          <div style={{ marginTop: 'var(--space-6)' }}>{children}</div>
          {footer && <p className="auth-footer muted text-sm">{footer}</p>}
        </div>
      </main>
    </div>
  );
}

export function Login() {
  usePageMeta('Sign in', 'Sign in to EMAN.');
  const { user, signIn } = useAuth();
  const { query, navigate } = useRouter();
  const [f, setF] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (user) navigate(safeNext(query), { replace: true }); }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\S+@\S+\.\S{2,}$/.test(f.email.trim())) errs.email = 'Enter a valid email address.';
    if (!f.password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError('');
    try {
      const d = await post('/api/auth/login', f);
      signIn(d);
      navigate(safeNext(query), { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue learning with Eman." footer={<>New to EMAN? <Link to={`/register${location.search}`}>Create an account</Link></>}>
      <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={submit} noValidate>
        {query.get('reset') && <Alert tone="success">Your password was reset. Please sign in.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} icon="mail" type="email" autoComplete="email" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Password" error={errors.password}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Checkbox label="Remember me" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />
          <Link to="/forgot-password" className="text-sm">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" block loading={loading}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function Register() {
  usePageMeta('Create account', 'Create your free EMAN account.');
  const { user, signIn } = useAuth();
  const { query, navigate } = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '', confirmPassword: '', acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (user) navigate(safeNext(query), { replace: true }); }, [user]);
  const s = strength(f.password);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S{2,}$/.test(f.email.trim())) errs.email = 'Enter a valid email address.';
    if (f.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) errs.password = 'Use at least one letter and one number.';
    if (f.confirmPassword !== f.password) errs.confirmPassword = 'Passwords do not match.';
    if (!f.acceptTerms) errs.acceptTerms = 'Please accept the Terms and Privacy Policy.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError('');
    try {
      const d = await post('/api/auth/register', f);
      signIn(d);
      navigate(d.user.role === 'admin' ? '/admin/ai?welcome=1' : safeNext(query), { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.fields ? '' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Free to start. Takes less than a minute." footer={<>Already have an account? <Link to={`/login${location.search}`}>Sign in</Link></>}>
      <form className="stack" style={{ '--gap': 'var(--space-4)' }} onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Full name" error={errors.name}>{(p) => <Input {...p} icon="user" autoComplete="name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} icon="mail" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with a letter and a number.">
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
        </Field>
        {f.password && (
          <div className="pw-meter" aria-live="polite">
            <div className="pw-bars">{[0, 1, 2, 3].map((i) => <span key={i} data-on={i < s ? s : 0} />)}</div>
            <span className="text-xs subtle">{['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s]}</span>
          </div>
        )}
        <Field label="Confirm password" error={errors.confirmPassword}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} />}</Field>
        <div>
          <Checkbox
            checked={f.acceptTerms}
            onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })}
            label={<span>I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a></span>}
            aria-invalid={errors.acceptTerms ? true : undefined}
          />
          {errors.acceptTerms && <p className="field-error" role="alert" style={{ marginTop: 6 }}><Icon name="alert-circle" size={14} />{errors.acceptTerms}</p>}
        </div>
        <Button type="submit" size="lg" block loading={loading} icon="sparkles">Create account</Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  usePageMeta('Forgot password');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S{2,}$/.test(email.trim())) return setErr('Enter a valid email address.');
    setLoading(true);
    setErr('');
    try {
      const d = await post('/api/auth/forgot-password', { email });
      setDone(d.message);
    } catch (x) {
      setErr(x.fields?.email || x.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we’ll send you a reset link." footer={<Link to="/login">Back to sign in</Link>}>
      {done ? (
        <Alert tone="success" title="Check your email">{done} The link expires in 1 hour.</Alert>
      ) : (
        <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={submit} noValidate>
          <Field label="Email" error={err}>{(p) => <Input {...p} icon="mail" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" size="lg" block loading={loading}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  usePageMeta('Choose a new password');
  const { query, navigate } = useRouter();
  const token = query.get('token') || '';
  const [f, setF] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (f.password !== f.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setErr('');
    try {
      await post('/api/auth/reset-password', { token, ...f });
      navigate('/login?reset=1', { replace: true });
    } catch (x) {
      setErrors(x.fields || {});
      setErr(x.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/forgot-password">Request a new link</Link>}>
      {!token ? (
        <Alert tone="danger">This reset link is incomplete. Please request a new one.</Alert>
      ) : (
        <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={submit} noValidate>
          {err && <Alert tone="danger">{err}</Alert>}
          <Field label="New password" error={errors.password}>{(p) => <PasswordInput {...p} autoComplete="new-password" autoFocus value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
          <Field label="Confirm new password" error={errors.confirmPassword}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} />}</Field>
          <Button type="submit" size="lg" block loading={loading}>Save new password</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmail() {
  usePageMeta('Verify email');
  const { query } = useRouter();
  const [state, setState] = useState('loading');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    post('/api/auth/verify-email', { token: query.get('token') || '' })
      .then(() => setState('ok'))
      .catch((e) => { setMsg(e.message); setState('error'); });
  }, []);
  return (
    <AuthLayout title="Email verification">
      {state === 'loading' && <p className="muted">Verifying…</p>}
      {state === 'ok' && <><Alert tone="success" title="Email verified">Thank you — your email address is confirmed.</Alert><div style={{ marginTop: 'var(--space-5)' }}><Button href="/dashboard" block>Go to dashboard</Button></div></>}
      {state === 'error' && <Alert tone="danger">{msg}</Alert>}
    </AuthLayout>
  );
}
