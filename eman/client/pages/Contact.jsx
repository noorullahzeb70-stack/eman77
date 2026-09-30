import { useState } from 'react';
import { PublicLayout } from '../components/layout/PublicLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, Alert } from '../components/ui/Primitives.jsx';
import { Field, Input, Textarea } from '../components/ui/Form.jsx';
import { PageHero } from './_shared.jsx';
import { post } from '../lib/api.js';
import { usePageMeta } from '../lib/meta.js';

export function Contact() {
  usePageMeta('Contact', 'Get in touch with the EMAN team.');
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (f.subject.trim().length < 3) e.subject = 'Please add a short subject.';
    if (f.message.trim().length < 10) e.message = 'Your message should be at least 10 characters.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setStatus('loading');
    try {
      await post('/api/contact', f);
      setStatus('done');
    } catch (err) {
      setErrors(err.fields || {});
      setMsg(err.message);
      setStatus('error');
    }
  };

  return (
    <PublicLayout>
      <PageHero eyebrow="Contact" title="We’d love to hear from you." text="Questions, feedback or partnership ideas — send us a message and we’ll reply by email." />
      <section className="section" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="container contact-grid">
          <Card>
            {status === 'done' ? (
              <div className="state">
                <div className="state-icon"><Icon name="check-circle" /></div>
                <p className="state-title">Message sent — thank you!</p>
                <p className="state-text">We’ll get back to you at {f.email}.</p>
                <Button variant="secondary" onClick={() => { setF({ name: '', email: '', subject: '', message: '', website: '' }); setStatus('idle'); }}>Send another</Button>
              </div>
            ) : (
              <form className="stack" style={{ '--gap': 'var(--space-5)' }} onSubmit={submit} noValidate>
                {status === 'error' && <Alert tone="danger">{msg}</Alert>}
                <div className="grid" style={{ '--min': '220px' }}>
                  <Field label="Name" required error={errors.name}>{(p) => <Input {...p} autoComplete="name" value={f.name} onChange={set('name')} />}</Field>
                  <Field label="Email" required error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" icon="mail" value={f.email} onChange={set('email')} />}</Field>
                </div>
                <Field label="Subject" required error={errors.subject}>{(p) => <Input {...p} value={f.subject} onChange={set('subject')} maxLength={140} />}</Field>
                <Field label="Message" required error={errors.message} hint={`${f.message.length}/5000`}>{(p) => <Textarea {...p} rows={6} value={f.message} onChange={set('message')} maxLength={5000} />}</Field>
                {/* Honeypot for bots — hidden from people and screen readers */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hp-field" aria-hidden="true" />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <p className="text-xs subtle">We only use your details to reply to you.</p>
                  <Button type="submit" loading={status === 'loading'} icon="send">Send message</Button>
                </div>
              </form>
            )}
          </Card>
          <div className="stack">
            <Card className="feature-row"><div className="icon-tile"><Icon name="chat" /></div><div><p className="cap-title">Need help fast?</p><p className="muted text-sm">Ask Eman — it can answer most questions about using the platform.</p></div></Card>
            <Card className="feature-row"><div className="icon-tile gold"><Icon name="shield" /></div><div><p className="cap-title">Privacy questions</p><p className="muted text-sm">Read our Privacy Policy, or ask for a copy or deletion of your data here.</p></div></Card>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'Your name, email address and password (stored only as a secure hash). Your conversations, uploaded files and preferences, so the service works. Basic technical data such as IP address and browser type for security and abuse prevention.'],
      ['How we use it', 'To provide EMAN: sign-in, saving your conversations, generating AI answers, and keeping the service secure. We do not sell your data and we do not use it for advertising.'],
      ['AI processing', 'When you send a message, its content (and any files you attach) is sent to the AI provider configured for EMAN to generate the answer. Providers process this data under their own terms. Do not share sensitive personal information you would not want processed this way.'],
      ['Cookies', 'We use one essential cookie to keep you signed in, and store your theme choice on your device. No advertising or tracking cookies are used, so no cookie banner is required for them.'],
      ['Your choices', 'You can edit your profile, delete conversations at any time, and ask us to export or delete your account via the Contact page.'],
      ['Security', 'Passwords are hashed with scrypt, sessions use secure HTTP-only cookies, and API keys are encrypted at rest. No system is perfectly secure, but we work to protect your data.'],
      ['Children', 'EMAN is intended for learners aged 13 and over. Younger learners should use it with a parent, guardian or teacher.'],
      ['Changes', 'If we change this policy we will update this page and notify signed-in users.'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      ['Using EMAN', 'You must provide accurate information when creating an account and keep your password safe. You are responsible for activity on your account.'],
      ['Acceptable use', 'Do not use EMAN to break the law, harass others, upload content you do not have the right to share, attempt to break security, or generate harmful content.'],
      ['Academic integrity', 'Use Eman to learn and understand. Follow your school’s rules on AI use; you are responsible for work you submit.'],
      ['AI answers', 'AI output can be wrong or incomplete. Check important information with reliable sources. EMAN is not a substitute for professional medical, legal or financial advice.'],
      ['Content', 'You keep ownership of what you upload. Books and materials in the library are provided only where we have the right to share them.'],
      ['Availability', 'We aim to keep EMAN available but may change, suspend or limit features, including daily AI usage limits.'],
      ['Termination', 'We may suspend accounts that break these terms. You may stop using EMAN and request account deletion at any time.'],
    ],
  },
  'ai-notice': {
    title: 'AI Usage Notice',
    sections: [
      ['What Eman is', 'Eman is an AI assistant powered by a large language model from a third-party provider selected by the EMAN administrator.'],
      ['Limitations', 'Eman can make mistakes, misunderstand questions, or present outdated information confidently. It does not browse the internet unless stated.'],
      ['Your data', 'Messages and attached files are sent to the AI provider to generate answers. Avoid sharing passwords, ID numbers or other sensitive data.'],
      ['Responsible use', 'Use Eman to support your learning, not to replace your own thinking. Always cite and check sources for academic work.'],
    ],
  },
};

export function Legal({ page }) {
  const doc = LEGAL[page];
  usePageMeta(doc.title, `${doc.title} for EMAN.`);
  return (
    <PublicLayout>
      <PageHero eyebrow="Legal" title={doc.title} text={`Last updated ${new Date(2026, 8, 30).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`} />
      <section className="section" style={{ paddingTop: 'var(--space-6)' }}>
        <div className="container legal">
          {doc.sections.map(([h, t]) => (
            <div key={h}><h2>{h}</h2><p className="muted">{t}</p></div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

export function NotFound() {
  usePageMeta('Page not found');
  return (
    <PublicLayout>
      <section className="section">
        <div className="container">
          <div className="state">
            <div className="state-icon"><Icon name="search" /></div>
            <p className="display" style={{ fontSize: 'var(--text-5xl)' }}>404</p>
            <p className="state-title">This page could not be found.</p>
            <p className="state-text">The link may be broken or the page may have moved.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button href="/" icon="home">Go home</Button>
              <Button href="/contact" variant="secondary">Report a problem</Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
