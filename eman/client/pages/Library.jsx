import { useEffect, useState } from 'react';
import { PublicLayout } from '../components/layout/PublicLayout.jsx';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, EmptyState, SkeletonCard, Badge, Modal } from '../components/ui/Primitives.jsx';
import { Input } from '../components/ui/Form.jsx';
import { PageHero } from './_shared.jsx';
import { get } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useRouter } from '../lib/router.jsx';
import { usePageMeta, startChatWith } from '../lib/meta.js';

/** Signed-in users see these pages inside the app shell; visitors see the public layout. */
function Shell({ children }) {
  const { user } = useAuth();
  return user ? <AppLayout>{children}</AppLayout> : <PublicLayout>{children}</PublicLayout>;
}

const SUBTOPICS = {
  programming: ['C++', 'Python', 'HTML', 'CSS', 'JavaScript'],
  'computer-science': ['Data structures', 'Algorithms', 'Operating systems', 'Networks', 'Databases'],
  'artificial-intelligence': ['Machine learning basics', 'Neural networks', 'Prompting well', 'AI ethics'],
  'cyber-security': ['Passwords & 2FA', 'Phishing', 'Network security', 'Safe browsing'],
  mathematics: ['Algebra', 'Calculus', 'Statistics', 'Probability', 'Geometry'],
  english: ['Grammar', 'Vocabulary', 'Essay writing', 'Reading comprehension'],
};

export function Education() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [subjects, setSubjects] = useState(null);
  const [open, setOpen] = useState(() => location.hash.slice(1) || null);
  usePageMeta('Education', 'Learn Programming, Computer Science, AI, Cyber Security, Mathematics and English with EMAN’s AI study assistant.');
  useEffect(() => { get('/api/education').then((d) => setSubjects(d.subjects)).catch(() => setSubjects([])); }, []);
  const study = (subject, topic) => {
    const prompt = `Teach me ${topic} (${subject}) from the beginning. Start with a simple overview, then the key ideas step by step, an example, and a short practice question.`;
    startChatWith(prompt, navigate, !!user);
  };
  return (
    <Shell>
      {!user && <PageHero eyebrow="Education" title="Choose a subject. Start learning." text="Pick a topic and Eman will teach it step by step — with examples and practice questions." />}
      <section className={user ? '' : 'section'} style={{ paddingTop: user ? 0 : 'var(--space-8)' }}>
        <div className={user ? '' : 'container'}>
          {user && <div className="app-page-head"><h1 className="app-title">Education</h1><p className="muted">Choose a topic and Eman will teach it step by step.</p></div>}
          <div className="stack" style={{ '--gap': 'var(--space-3)' }}>
            {subjects === null && Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
            {subjects?.map((s) => {
              const isOpen = open === s.slug;
              return (
                <div key={s.id} id={s.slug} className={`card subject-acc ${isOpen ? 'open' : ''}`}>
                  <button className="subject-acc-head" aria-expanded={isOpen} aria-controls={`panel-${s.slug}`} onClick={() => setOpen(isOpen ? null : s.slug)}>
                    <div className="icon-tile gold"><Icon name={s.icon || 'book'} /></div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <p className="cap-title">{s.name}</p>
                      <p className="muted text-sm">{s.description}</p>
                    </div>
                    {s.resources > 0 && <Badge tone="primary">{s.resources} resources</Badge>}
                    <Icon name="chevron-down" className="acc-chev" />
                  </button>
                  {isOpen && (
                    <div className="subject-acc-body" id={`panel-${s.slug}`}>
                      <p className="text-sm muted" style={{ marginBottom: 'var(--space-3)' }}>Start a guided lesson with Eman:</p>
                      <div className="topic-chips">
                        {(SUBTOPICS[s.slug] || []).map((t) => (
                          <button key={t} className="topic-chip" onClick={() => study(s.name, t)}><Icon name="sparkles" size={14} />{t}</button>
                        ))}
                      </div>
                      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                        <Button size="sm" variant="soft" icon="quiz" onClick={() => navigate(user ? `/tools?tool=quiz&topic=${encodeURIComponent(s.name)}` : '/register?next=%2Ftools')}>Quiz me</Button>
                        <Button size="sm" variant="soft" icon="cards" onClick={() => navigate(user ? `/tools?tool=flashcards&topic=${encodeURIComponent(s.name)}` : '/register?next=/tools')}>Flashcards</Button>
                        <Button size="sm" variant="soft" icon="calendar" onClick={() => navigate(user ? `/tools?tool=plan&topic=${encodeURIComponent(s.name)}` : '/register?next=/tools')}>Study plan</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}

export function Books() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  usePageMeta('Books & Library', 'Browse EMAN’s library of legally provided books and study materials by category.');
  useEffect(() => { get('/api/categories?type=book').then((d) => setCats(d.items)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setErr(null);
      const p = new URLSearchParams({ limit: '48' });
      if (cat) p.set('category', cat);
      if (q.trim()) p.set('q', q.trim());
      get(`/api/books?${p}`).then(setData).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [cat, q]);
  return (
    <Shell>
      {!user && <PageHero eyebrow="Library" title="Books & learning materials" text="Legally provided books, organised by subject." />}
      <section className={user ? '' : 'section'} style={{ paddingTop: user ? 0 : 'var(--space-8)' }}>
        <div className={user ? '' : 'container'}>
          {user && <div className="app-page-head"><h1 className="app-title">Library</h1><p className="muted">Books and study materials by category.</p></div>}
          <div className="filters">
            <Input icon="search" type="search" placeholder="Search by title or author" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search books" />
            <div className="chip-row" role="tablist" aria-label="Categories">
              <button className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
              {cats.map((c) => <button key={c.id} className="chip" aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)}><Icon name={c.icon || 'book'} size={14} />{c.name}</button>)}
            </div>
          </div>
          {err ? (
            <EmptyState error icon="alert-circle" title="Couldn’t load books." text={err} />
          ) : data === null ? (
            <div className="grid" style={{ '--min': '200px' }}>{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}</div>
          ) : data.items.length === 0 ? (
            <Card><EmptyState icon="book-open" title="No books found." text={q || cat ? 'Try a different search or category.' : 'Books will appear here once an administrator adds them.'} /></Card>
          ) : (
            <div className="grid" style={{ '--min': '190px' }}>
              {data.items.map((b) => (
                <div key={b.id} className="card book-card">
                  <div className="book-cover">{b.cover_url ? <img src={b.cover_url} alt="" loading="lazy" /> : <Icon name="book" size={36} />}</div>
                  {b.category && <Badge tone="primary">{b.category}</Badge>}
                  <p className="cap-title">{b.title}</p>
                  <p className="muted text-sm">{b.author}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

export function Gallery() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  const [data, setData] = useState(null);
  const [view, setView] = useState(null);
  usePageMeta('Gallery', 'Images and visuals from the EMAN community.');
  useEffect(() => { get('/api/categories?type=gallery').then((d) => setCats(d.items)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    get(`/api/gallery?limit=60${cat ? `&category=${cat}` : ''}`).then(setData).catch(() => setData({ items: [] }));
  }, [cat]);
  return (
    <Shell>
      {!user && <PageHero eyebrow="Gallery" title="Moments & visuals" />}
      <section className={user ? '' : 'section'} style={{ paddingTop: user ? 0 : 'var(--space-8)' }}>
        <div className={user ? '' : 'container'}>
          {user && <div className="app-page-head"><h1 className="app-title">Gallery</h1></div>}
          <div className="chip-row" style={{ marginBottom: 'var(--space-5)' }}>
            <button className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
            {cats.map((c) => <button key={c.id} className="chip" aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)}>{c.name}</button>)}
          </div>
          {data === null ? (
            <div className="grid" style={{ '--min': '220px' }}>{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}</div>
          ) : data.items.length === 0 ? (
            <Card><EmptyState icon="image" title="No images available yet." text="Images added to the gallery will appear here." /></Card>
          ) : (
            <div className="masonry">
              {data.items.map((g) => (
                <button key={g.id} className="masonry-item" onClick={() => setView(g)} aria-label={`Open ${g.title}`}>
                  <img src={g.url} alt={g.alt_text} loading="lazy" width={g.width} height={g.height} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.title ?? ''} size={960}>
        {view && (
          <div className="stack">
            <img src={view.url} alt={view.alt_text} style={{ borderRadius: 'var(--radius-md)', width: '100%' }} />
            {view.description && <p className="muted">{view.description}</p>}
            <div className="row"><Button href={`${view.url}?download=1`} variant="secondary" size="sm" icon="download" target="_blank">Download</Button></div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}
