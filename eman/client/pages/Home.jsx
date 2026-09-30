import { useEffect, useState } from 'react';
import { PublicLayout } from '../components/layout/PublicLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { LogoMark } from '../components/ui/Logo.jsx';
import { Card, SkeletonCard, Badge } from '../components/ui/Primitives.jsx';
import { Link } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { get } from '../lib/api.js';
import { usePageMeta } from '../lib/meta.js';

export const CAPABILITIES = [
  { icon: 'quiz', title: 'Ask questions', text: 'Get clear, direct answers to anything you are curious about.' },
  { icon: 'lightbulb', title: 'Explain concepts', text: 'Hard topics broken into simple steps, at your level.' },
  { icon: 'list', title: 'Summarize', text: 'Turn long notes, articles or PDFs into the key points.' },
  { icon: 'sparkles', title: 'Generate ideas', text: 'Brainstorm projects, essays, presentations and more.' },
  { icon: 'code', title: 'Programming help', text: 'Explain, write and debug C++, Python, JavaScript and more.' },
  { icon: 'calculator', title: 'Mathematics', text: 'Step-by-step working for algebra, calculus and statistics.' },
  { icon: 'feather', title: 'Writing help', text: 'Improve grammar, structure and clarity of your writing.' },
  { icon: 'graduation', title: 'Study assistance', text: 'Quizzes, flashcards and study plans made for you.' },
  { icon: 'search', title: 'Research assistance', text: 'Organise sources, outline arguments, compare viewpoints.' },
  { icon: 'globe', title: 'Multilingual', text: 'Ask in English, Arabic, Urdu and many more languages.' },
];

const WHY = [
  { icon: 'target', title: 'Built for learning', text: 'Answers are structured to teach: direct answer, explanation, example and key notes.' },
  { icon: 'shield', title: 'Private & secure', text: 'Your conversations belong to you. Passwords are hashed, keys are encrypted, data is never sold.' },
  { icon: 'zap', title: 'Fast & focused', text: 'A calm, distraction-free space that works beautifully on your phone and computer.' },
  { icon: 'layers', title: 'Everything in one place', text: 'AI assistant, study tools, library and resources — no switching between apps.' },
];

function HeroVisual() {
  const nodes = [
    { icon: 'code', label: 'Code', a: 0 },
    { icon: 'calculator', label: 'Math', a: 60 },
    { icon: 'feather', label: 'Writing', a: 120 },
    { icon: 'globe', label: 'Languages', a: 180 },
    { icon: 'book-open', label: 'Books', a: 240 },
    { icon: 'lightbulb', label: 'Ideas', a: 300 },
  ];
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="orbit orbit-1" />
      <div className="orbit orbit-2" />
      <div className="hero-core"><LogoMark size={104} /></div>
      <div className="orbit-nodes">
        {nodes.map((n) => (
          <div key={n.label} className="orbit-node" style={{ '--a': `${n.a}deg` }}>
            <div className="orbit-node-inner"><Icon name={n.icon} /><span>{n.label}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, text, action }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        {text && <p className="muted section-text">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [site, setSite] = useState(null);
  const [subjects, setSubjects] = useState(null);
  const [books, setBooks] = useState(null);
  const [gallery, setGallery] = useState(null);
  usePageMeta('EMAN — Your Intelligent Companion for Learning, Knowledge & Creativity', 'EMAN is an AI-powered education platform: ask questions, study smarter with AI tools, and explore books and learning resources.');

  useEffect(() => {
    get('/api/site').then(setSite).catch(() => setSite({}));
    get('/api/education').then((d) => setSubjects(d.subjects)).catch(() => setSubjects([]));
    get('/api/books?featured=1&limit=4').then((d) => setBooks(d.items)).catch(() => setBooks([]));
    get('/api/gallery?limit=6').then((d) => setGallery(d.items)).catch(() => setGallery([]));
  }, []);

  const hp = site?.homepage ?? {};
  const askHref = user ? '/chat' : '/register?next=/chat';

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
        <div className="container hero-grid">
          <div className="hero-copy animate-in">
            <Badge tone="gold" icon="sparkles">AI • Education • Knowledge • Creativity</Badge>
            <h1 className="hero-title display">{hp.heroTitle || 'EMAN'}</h1>
            <p className="hero-sub">{hp.heroSubtitle || 'Your Intelligent Companion for Learning, Knowledge & Creativity.'}</p>
            <p className="hero-desc muted">
              {hp.heroDescription || 'Ask questions, understand difficult topics, practise with AI study tools and explore a growing library of learning resources — all in one calm, focused place.'}
            </p>
            <div className="row hero-actions">
              <Button href={askHref} size="lg" icon="sparkles">Ask Eman</Button>
              <Button href="/education" size="lg" variant="secondary" iconRight="arrow-right">Explore Education</Button>
            </div>
            <p className="text-xs subtle">Free to start · Works on phone and computer · Install as an app</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* AI Assistant */}
      <section className="section" id="ai">
        <div className="container">
          <SectionHead eyebrow="AI Assistant" title="What can Eman do for you?" text="A patient tutor, writing partner and research helper — available whenever you need it." action={<Button href="/ai" variant="ghost" iconRight="arrow-right">How it works</Button>} />
          <div className="grid cap-grid">
            {CAPABILITIES.map((c, i) => (
              <Card key={c.title} interactive className="cap-card animate-in" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="icon-tile"><Icon name={c.icon} /></div>
                <h3 className="cap-title">{c.title}</h3>
                <p className="muted text-sm">{c.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Education */}
      <section className="section section-tint">
        <div className="container">
          <SectionHead eyebrow="Education" title="Learn by subject" text="Structured learning areas with notes, guides and an AI study assistant on every topic." action={<Button href="/education" variant="ghost" iconRight="arrow-right">All subjects</Button>} />
          <div className="grid" style={{ '--min': '250px' }}>
            {subjects === null
              ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
              : subjects.map((s) => (
                <Link key={s.id} to={`/education#${s.slug}`} className="card card-interactive subject-card">
                  <div className="icon-tile gold"><Icon name={s.icon || 'book'} /></div>
                  <div>
                    <h3 className="cap-title">{s.name}</h3>
                    <p className="muted text-sm">{s.description}</p>
                  </div>
                  <Icon name="chevron" className="subject-chev" />
                </Link>
              ))}
          </div>
          <div className="tools-strip card">
            <div className="row" style={{ '--gap': 'var(--space-4)' }}>
              <div className="icon-tile"><Icon name="lightbulb" /></div>
              <div>
                <p style={{ fontWeight: 700 }}>AI Study Tools</p>
                <p className="muted text-sm">Explain a topic · Summarize · Quiz · Flashcards · Study plan · Code explainer · Writing · Translation</p>
              </div>
            </div>
            <Button href={user ? '/tools' : '/register?next=/tools'} variant="soft" iconRight="arrow-right">Try the tools</Button>
          </div>
        </div>
      </section>

      {/* Books */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Library" title="Featured books" text="Legally provided books and study materials, organised by category." action={<Button href="/books" variant="ghost" iconRight="arrow-right">Browse library</Button>} />
          {books === null ? (
            <div className="grid" style={{ '--min': '200px' }}>{Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}</div>
          ) : books.length ? (
            <div className="grid" style={{ '--min': '200px' }}>
              {books.map((b) => (
                <Link key={b.id} to={`/books/${b.id}`} className="card card-interactive book-card">
                  <div className="book-cover">{b.cover_url ? <img src={b.cover_url} alt="" loading="lazy" /> : <Icon name="book" size={36} />}</div>
                  <p className="cap-title">{b.title}</p>
                  <p className="muted text-sm">{b.author}</p>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="soft-empty">
              <Icon name="book-open" size={28} />
              <div>
                <p style={{ fontWeight: 700 }}>The library is being prepared.</p>
                <p className="muted text-sm">Nine categories are ready — from Computer Science to Islamic Studies. Books appear here as soon as they are added.</p>
              </div>
              <Button href="/books" variant="secondary" size="sm">View categories</Button>
            </Card>
          )}
        </div>
      </section>

      {/* Gallery */}
      {gallery?.length > 0 && (
        <section className="section section-tint">
          <div className="container">
            <SectionHead eyebrow="Gallery" title="Moments & visuals" action={<Button href="/gallery" variant="ghost" iconRight="arrow-right">Open gallery</Button>} />
            <div className="home-gallery">
              {gallery.map((g) => (
                <Link key={g.id} to="/gallery" className="home-gallery-item"><img src={g.url} alt={g.alt_text} loading="lazy" /></Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why */}
      <section className={`section ${gallery?.length ? '' : 'section-tint'}`}>
        <div className="container">
          <SectionHead eyebrow="Why Eman?" title="Designed around how students actually learn" />
          <div className="grid" style={{ '--min': '240px' }}>
            {WHY.map((w) => (
              <Card key={w.title} className="why-card">
                <div className="icon-tile gold"><Icon name={w.icon} /></div>
                <h3 className="cap-title">{w.title}</h3>
                <p className="muted text-sm">{w.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="cta">
            <div className="cta-glow" aria-hidden="true" />
            <LogoMark size={56} />
            <h2 className="display cta-title">{hp.ctaTitle || 'Start Your Journey With Eman'}</h2>
            <p className="cta-text">Create a free account and ask your first question in seconds.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button href={user ? '/chat' : '/register'} size="lg" variant="gold" iconRight="arrow-right">{user ? 'Continue learning' : 'Create free account'}</Button>
              {!user && <Button href="/login" size="lg" variant="ghost" className="cta-ghost">Sign in</Button>}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
