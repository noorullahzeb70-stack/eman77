import { useState } from 'react';
import { Logo, LogoMark } from '../components/ui/Logo.jsx';
import { Icon, iconNames } from '../components/ui/Icon.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, PasswordInput, Textarea, Select, Checkbox, Switch } from '../components/ui/Form.jsx';
import {
  Card, Badge, Alert, Avatar, Modal, ConfirmDialog, Menu, Tabs, Skeleton, SkeletonCard,
  TypingIndicator, Progress, EmptyState, useToast,
} from '../components/ui/Primitives.jsx';
import { ThemeToggle, ThemeSegmented } from '../components/ui/ThemeToggle.jsx';

const COLORS = [
  ['Primary', '--primary'], ['Primary soft', '--primary-soft'], ['Accent (gold)', '--accent'], ['Accent soft', '--accent-soft'],
  ['Background', '--bg'], ['Surface', '--surface'], ['Muted', '--bg-muted'], ['Border', '--border-strong'],
  ['Text', '--text'], ['Text muted', '--text-muted'], ['Success', '--success'], ['Warning', '--warning'],
  ['Danger', '--danger'], ['Info', '--info'],
];

function Section({ id, title, desc, children }) {
  return (
    <section id={id} className="stack" style={{ '--gap': 'var(--space-5)', paddingBlock: 'var(--space-10)', borderTop: '1px solid var(--border)' }} aria-labelledby={`${id}-h`}>
      <div>
        <h2 id={`${id}-h`} style={{ fontSize: 'var(--text-2xl)' }}>{title}</h2>
        {desc && <p className="muted" style={{ marginTop: 4 }}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignSystem() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(true);
  const [email, setEmail] = useState('');
  const [progress, setProgress] = useState(35);
  const emailErr = email && !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email address.' : null;

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Logo />
          <span className="badge badge-gold">Design System</span>
          <div className="header-actions"><ThemeToggle /></div>
        </div>
      </header>

      <main id="main" className="container" style={{ paddingBottom: 'var(--space-20)' }}>
        {/* Hero */}
        <div style={{ position: 'relative', paddingBlock: 'var(--space-16) var(--space-10)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--gradient-hero)', zIndex: -1, borderRadius: 'var(--radius-xl)' }} />
          <p className="eyebrow">Phase 1 · Foundations</p>
          <h1 className="display" style={{ fontSize: 'var(--text-5xl)', marginTop: 'var(--space-3)' }}>
            The <span className="gradient-text">EMAN</span> design language
          </h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 'var(--space-4)', fontSize: 'var(--text-lg)' }}>
            Deep emerald for knowledge and trust, warm gold for light and warmth. Every screen in EMAN is built from these tokens and components, in light and dark mode.
          </p>
        </div>

        <Section id="logo" title="Logo" desc="“Lamp of Knowledge” — an open book whose pages rise toward a spark of light.">
          <div className="grid" style={{ '--min': '220px' }}>
            <Card className="stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <LogoMark size={96} />
              <span className="text-xs subtle">Mark</span>
            </Card>
            <Card className="stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <Logo size={48} />
              <span className="text-xs subtle">Horizontal lockup</span>
            </Card>
            <Card className="stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200, background: 'var(--gradient-brand)', border: 0 }}>
              <span className="display" style={{ color: '#fff', fontSize: '2.4rem', letterSpacing: '0.12em' }}>EMAN</span>
              <span className="text-xs" style={{ color: 'rgb(255 255 255 / .8)', letterSpacing: '0.2em' }}>AI • EDUCATION • KNOWLEDGE • CREATIVITY</span>
            </Card>
          </div>
        </Section>

        <Section id="colors" title="Color" desc="Semantic tokens — switch the theme to see dark values.">
          <div className="grid" style={{ '--min': '150px', '--gap': 'var(--space-3)' }}>
            {COLORS.map(([name, v]) => (
              <div key={v} className="swatch">
                <div className="swatch-color" style={{ background: `var(${v})` }} />
                <div className="swatch-meta"><strong>{name}</strong><br /><code>{v}</code></div>
              </div>
            ))}
          </div>
          <div className="row"><span className="text-sm muted">Theme:</span><ThemeSegmented /></div>
        </Section>

        <Section id="type" title="Typography" desc="Fraunces for display, Plus Jakarta Sans for interface, JetBrains Mono for code.">
          <Card className="stack" style={{ '--gap': 'var(--space-3)' }}>
            <p className="eyebrow">Eyebrow label</p>
            <p className="display" style={{ fontSize: 'var(--text-4xl)' }}>Knowledge is light.</p>
            <h3 style={{ fontSize: 'var(--text-2xl)' }}>Section heading</h3>
            <p>Body text — EMAN explains difficult ideas simply, step by step, at the learner’s own pace.</p>
            <p className="muted text-sm">Secondary text for supporting details and descriptions.</p>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>const answer = await eman.ask("What is entropy?");</code>
          </Card>
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="row">
            <Button icon="sparkles">Ask Eman</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="soft" icon="book-open">Soft</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="gold" iconRight="arrow-right">Get started</Button>
            <Button variant="danger" icon="trash">Delete</Button>
          </div>
          <div className="row">
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <Button iconOnly icon="plus" aria-label="New" variant="secondary" />
            <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1600); }}>
              {loading ? 'Saving' : 'Click to load'}
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section id="forms" title="Inputs & forms">
          <Card>
            <form className="grid" style={{ '--min': '260px', '--gap': 'var(--space-5)' }} onSubmit={(e) => { e.preventDefault(); toast('Form submitted'); }}>
              <Field label="Email" required error={emailErr} hint="We never share your email.">
                {(p) => <Input {...p} icon="mail" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field label="Password" required hint="At least 8 characters.">
                {(p) => <PasswordInput {...p} placeholder="••••••••" autoComplete="new-password" />}
              </Field>
              <Field label="Subject">
                {(p) => (
                  <Select {...p} defaultValue="math">
                    <option value="math">Mathematics</option>
                    <option value="cs">Computer Science</option>
                    <option value="english">English</option>
                  </Select>
                )}
              </Field>
              <Field label="Search">
                {(p) => <Input {...p} icon="search" type="search" placeholder="Search books, notes, chats…" />}
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Message">{(p) => <Textarea {...p} placeholder="Write your question…" />}</Field>
              </div>
              <div className="row" style={{ gridColumn: '1 / -1', justifyContent: 'space-between' }}>
                <div className="row" style={{ '--gap': 'var(--space-6)' }}>
                  <Checkbox label="Remember me" defaultChecked />
                  <Switch label="Email notifications" checked={notify} onChange={setNotify} />
                </div>
                <Button type="submit">Submit</Button>
              </div>
            </form>
          </Card>
        </Section>

        <Section id="cards" title="Cards">
          <div className="grid">
            <Card interactive className="stack">
              <div className="icon-tile"><Icon name="sparkles" /></div>
              <h3 className="card-title">AI Assistant</h3>
              <p className="muted text-sm">Ask anything — explanations, summaries, code help and more.</p>
            </Card>
            <Card interactive className="stack">
              <div className="icon-tile gold"><Icon name="book-open" /></div>
              <h3 className="card-title">Library</h3>
              <p className="muted text-sm">Curated books and study materials, organised by subject.</p>
            </Card>
            <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', padding: 3, background: 'var(--gradient-brand)' }}>
              <Card glass className="stack" style={{ height: '100%' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Avatar name="Aisha Rahman" />
                  <Badge tone="gold" icon="star">Glass</Badge>
                </div>
                <h3 className="card-title">Glass surface</h3>
                <p className="muted text-sm">Used sparingly — over imagery and the hero.</p>
              </Card>
            </div>
          </div>
        </Section>

        <Section id="badges" title="Badges & alerts">
          <div className="row">
            <Badge>Neutral</Badge>
            <Badge tone="primary" dot>Online</Badge>
            <Badge tone="gold" icon="star">Featured</Badge>
            <Badge tone="success">Active</Badge>
            <Badge tone="warning">Pending</Badge>
            <Badge tone="danger">Suspended</Badge>
          </div>
          <div className="stack" style={{ '--gap': 'var(--space-3)' }}>
            <Alert tone="info" title="AI usage notice">Eman can make mistakes. Check important information.</Alert>
            <Alert tone="success" title="Saved">Your profile has been updated.</Alert>
            <Alert tone="warning">You have used 90% of today’s AI requests.</Alert>
            <Alert tone="danger" title="Eman AI is temporarily unavailable" action={<Button size="sm" variant="secondary" icon="refresh">Retry</Button>}>
              Please try again in a moment.
            </Alert>
          </div>
        </Section>

        <Section id="overlays" title="Modals, menus & tabs">
          <div className="row">
            <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm dialog</Button>
            <Menu
              align="left"
              label="Conversation options"
              trigger={(p) => <Button variant="secondary" iconRight="chevron-down" {...p}>Dropdown</Button>}
              items={[
                { label: 'Rename', icon: 'edit', onSelect: () => toast('Rename selected', 'info') },
                { label: 'Pin', icon: 'pin', onSelect: () => toast('Pinned') },
                { label: 'Favorite', icon: 'star', onSelect: () => toast('Added to favorites') },
                'sep',
                { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setConfirm(true) },
              ]}
            />
            <Button variant="ghost" onClick={() => toast('Something went wrong. Please try again.', 'error')}>Error toast</Button>
          </div>
          <Tabs
            label="Example tabs"
            value={tab}
            onChange={setTab}
            tabs={[{ value: 'overview', label: 'Overview' }, { value: 'notes', label: 'Notes' }, { value: 'quizzes', label: 'Quizzes' }, { value: 'resources', label: 'Resources' }]}
          />
          <Card><p className="muted" role="tabpanel">Showing the <strong>{tab}</strong> panel. Use ← → keys to move between tabs.</p></Card>
        </Section>

        <Section id="loading" title="Loading states">
          <div className="grid">
            <SkeletonCard />
            <Card className="stack">
              <div className="row"><Skeleton width={40} height={40} radius="50%" /><div className="stack" style={{ flex: 1, '--gap': '8px' }}><Skeleton width="50%" height={14} /><Skeleton width="30%" height={10} /></div></div>
              <Skeleton height={12} /><Skeleton height={12} width="90%" /><Skeleton height={12} width="60%" />
            </Card>
            <Card className="stack">
              <div className="row"><div className="icon-tile"><Icon name="sparkles" /></div><TypingIndicator /></div>
              <p className="text-sm muted">Upload progress</p>
              <Progress value={progress} label="Upload progress" />
              <div className="row"><Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.min(100, p + 15))}>Advance</Button><Button size="sm" variant="ghost" onClick={() => setProgress(0)}>Reset</Button></div>
            </Card>
          </div>
        </Section>

        <Section id="states" title="Empty & error states">
          <div className="grid">
            <Card><EmptyState icon="chat" title="Start your first conversation with Eman." text="Ask a question, upload a document, or try a study tool." action={<Button icon="sparkles">Ask Eman</Button>} /></Card>
            <Card><EmptyState icon="image" title="No images available yet." text="Images added to the gallery will appear here." /></Card>
            <Card><EmptyState error icon="wifi-off" title="Please check your internet connection." text="We’ll reconnect automatically when you’re back online." action={<Button variant="secondary" icon="refresh">Try again</Button>} /></Card>
          </div>
        </Section>

        <Section id="icons" title="Icons" desc={`${iconNames.length} built-in icons, no external dependency.`}>
          <div className="grid" style={{ '--min': '96px', '--gap': 'var(--space-2)' }}>
            {iconNames.map((n) => (
              <div key={n} className="card stack" style={{ padding: 'var(--space-3)', alignItems: 'center', '--gap': '6px' }}>
                <Icon name={n} size={22} />
                <span className="text-xs subtle" style={{ wordBreak: 'break-all', textAlign: 'center' }}>{n}</span>
              </div>
            ))}
          </div>
        </Section>
      </main>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Rename conversation"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={() => { setModal(false); toast('Conversation renamed'); }}>Save</Button></>}
      >
        <Field label="Title">{(p) => <Input {...p} defaultValue="Photosynthesis explained" autoFocus />}</Field>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); toast('Conversation deleted'); }}
        title="Delete conversation?"
        message="This conversation and all its messages will be permanently deleted."
        confirmLabel="Delete"
        danger
      />
    </>
  );
}
