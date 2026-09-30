import { PublicLayout } from '../components/layout/PublicLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card } from '../components/ui/Primitives.jsx';
import { PageHero, FeatureList } from './_shared.jsx';
import { CAPABILITIES } from './Home.jsx';
import { usePageMeta } from '../lib/meta.js';
import { useAuth } from '../lib/auth.jsx';

export function About() {
  usePageMeta('About EMAN', 'EMAN brings an AI tutor, study tools and a learning library together in one calm, trustworthy place for students.');
  return (
    <PublicLayout>
      <PageHero eyebrow="About" title="Knowledge should feel within reach." text="EMAN is an AI-powered learning companion built for students and teachers. It combines a patient AI tutor, practical study tools and a curated library in one calm, focused place." />
      <section className="section" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="container prose-grid">
          <div className="stack">
            <h2 className="section-title">Our mission</h2>
            <p className="muted">To help every learner understand — not just memorise. Eman explains ideas step by step, adapts to your level, and encourages you to think for yourself.</p>
            <h2 className="section-title" style={{ marginTop: 'var(--space-6)' }}>What guides us</h2>
            <ul className="check-list">
              <li><Icon name="check" /> <span><strong>Honesty.</strong> Eman says when it doesn’t know, and never invents sources.</span></li>
              <li><Icon name="check" /> <span><strong>Respect.</strong> Warm, patient, and respectful of every learner and culture.</span></li>
              <li><Icon name="check" /> <span><strong>Privacy.</strong> Your data is yours. We collect only what the service needs.</span></li>
              <li><Icon name="check" /> <span><strong>Understanding first.</strong> For homework, Eman guides your reasoning instead of just giving answers.</span></li>
            </ul>
          </div>
          <Card className="stack about-card">
            <p className="eyebrow">The name</p>
            <p className="display" style={{ fontSize: 'var(--text-3xl)' }}>EMAN</p>
            <p className="muted">Our logo, the <em>Lamp of Knowledge</em>, is an open book whose pages rise toward a spark of light — learning that lights the way forward.</p>
            <hr className="divider" />
            <p className="text-sm muted">AI • Education • Knowledge • Creativity</p>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}

export function AIPage() {
  const { user } = useAuth();
  usePageMeta('Eman AI Assistant', 'Ask questions, get step-by-step explanations, help with code, maths and writing — in your language.');
  return (
    <PublicLayout>
      <PageHero eyebrow="Eman AI" title="A tutor that explains, step by step." text="Ask anything. Eman gives a direct answer, explains it simply, shows an example, and highlights what matters.">
        <div className="row" style={{ marginTop: 'var(--space-6)' }}>
          <Button href={user ? '/chat' : '/register?next=/chat'} size="lg" icon="sparkles">Ask Eman</Button>
          <Button href={user ? '/tools' : '/register?next=/tools'} size="lg" variant="secondary">Study tools</Button>
        </div>
      </PageHero>
      <section className="section" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="container stack" style={{ '--gap': 'var(--space-10)' }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 'var(--space-5)' }}>How Eman answers learning questions</h2>
            <div className="steps">
              {[['1', 'Direct answer', 'The short, clear answer first — no waffle.'], ['2', 'Explanation', 'Broken into simple steps, at your level.'], ['3', 'Example', 'A worked example or analogy to make it stick.'], ['4', 'Important notes', 'Common mistakes, exceptions and what to remember.']].map(([n, t, d]) => (
                <div key={n} className="step card"><span className="step-n">{n}</span><p className="cap-title">{t}</p><p className="muted text-sm">{d}</p></div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="section-title" style={{ marginBottom: 'var(--space-5)' }}>Capabilities</h2>
            <FeatureList items={CAPABILITIES} />
          </div>
          <Card className="notice-card">
            <Icon name="info" />
            <div>
              <p style={{ fontWeight: 700 }}>Good to know</p>
              <p className="muted text-sm">Eman can make mistakes. Check important facts, especially for exams, health or legal questions. You can attach images, PDFs and text files, and stop or regenerate any answer.</p>
            </div>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}

export function Features() {
  usePageMeta('Features', 'Everything EMAN offers: AI chat, study tools, library, gallery, dashboard, dark mode and more.');
  const groups = [
    { title: 'AI chat', items: [
      { icon: 'chat', title: 'Streaming answers', text: 'See answers appear as Eman writes them; stop any time.' },
      { icon: 'refresh', title: 'Regenerate & retry', text: 'Not happy with an answer? Get a fresh one in one tap.' },
      { icon: 'paperclip', title: 'Files & images', text: 'Attach photos of problems, PDFs and notes.' },
      { icon: 'code', title: 'Code & maths', text: 'Formatted code with highlighting, tables and step-by-step working.' },
      { icon: 'pin', title: 'Organised history', text: 'Search, rename, pin and favourite your conversations.' },
      { icon: 'zap', title: 'Fast · Balanced · Advanced', text: 'Choose speed or depth for each question.' },
    ] },
    { title: 'Learning', items: [
      { icon: 'lightbulb', title: 'Study tools', text: 'Explain, summarise, quiz, flashcards, study plans, code explainer, writing, translation.' },
      { icon: 'graduation', title: 'Subjects', text: 'Programming, Computer Science, AI, Cyber Security, Mathematics, English.' },
      { icon: 'book-open', title: 'Library', text: 'Books organised by category with favourites and bookmarks.' },
      { icon: 'image', title: 'Gallery', text: 'Browse images by category with a full-screen viewer.' },
    ] },
    { title: 'Your space', items: [
      { icon: 'grid', title: 'Dashboard', text: 'Recent chats, usage and quick actions at a glance.' },
      { icon: 'bell', title: 'Notifications', text: 'Account, resource and service updates.' },
      { icon: 'moon', title: 'Light & dark mode', text: 'Follows your device or your choice — remembered everywhere.' },
      { icon: 'monitor', title: 'Install as an app', text: 'Add EMAN to your home screen on Android, iPhone or desktop.' },
      { icon: 'lock', title: 'Secure by design', text: 'Encrypted keys, hashed passwords, protected sessions.' },
      { icon: 'key', title: 'Bring your own AI key', text: 'Optionally connect your own AI provider account.' },
    ] },
  ];
  return (
    <PublicLayout>
      <PageHero eyebrow="Features" title="Everything you need to learn with AI." text="Thoughtfully designed tools that work together — on your phone and your computer." />
      <section className="section" style={{ paddingTop: 'var(--space-8)' }}>
        <div className="container stack" style={{ '--gap': 'var(--space-12)' }}>
          {groups.map((g) => (
            <div key={g.title}>
              <h2 className="section-title" style={{ marginBottom: 'var(--space-5)' }}>{g.title}</h2>
              <FeatureList items={g.items} />
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
