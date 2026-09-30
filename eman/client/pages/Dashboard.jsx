import { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Card, Alert, EmptyState, Skeleton, Badge } from '../components/ui/Primitives.jsx';
import { Link } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { get } from '../lib/api.js';
import { usePageMeta, timeAgo } from '../lib/meta.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function UsageBars({ daily }) {
  // Last 7 days, filling missing days with 0.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), n: daily.find((x) => x.day === key)?.n ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="usage-bars" role="img" aria-label={`AI requests in the last 7 days: ${days.map((d) => d.n).join(', ')}`}>
      {days.map((d) => (
        <div key={d.key} className="usage-bar">
          <span className="usage-bar-val">{d.n || ''}</span>
          <span className="usage-bar-fill" style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} data-zero={d.n === 0 || undefined} />
          <span className="usage-bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  usePageMeta('Dashboard');
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => { setErr(''); get('/api/user/dashboard').then(setD).catch((e) => setErr(e.message)); };
  useEffect(load, []);

  return (
    <AppLayout>
      <div className="dash">
        <div className="dash-hero">
          <div>
            <p className="muted">{greeting()},</p>
            <h1 className="display dash-title">Welcome back, {user.name.split(' ')[0]}</h1>
          </div>
          <Button href="/chat?new=1" size="lg" icon="sparkles">Ask Eman</Button>
        </div>

        {err && <Alert tone="danger" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{err}</Alert>}

        {d && !d.aiReady && (
          user.role === 'admin' ? (
            <Alert tone="warning" title="Connect your AI provider" action={<Button size="sm" href="/admin/ai">Set up AI</Button>}>
              Eman needs an API key before it can answer. Open Admin → AI Settings, paste your key and press Test.
            </Alert>
          ) : (
            <Alert tone="info" title="Eman AI is being set up">The administrator is connecting the AI service. You can also add your own API key in Settings.</Alert>
          )
        )}

        <div className="quick-actions">
          {[
            { to: '/chat?new=1', icon: 'sparkles', label: 'Ask Eman', tone: '' },
            { to: d?.recent?.[0] ? `/chat/${d.recent[0].id}` : '/chat', icon: 'chat', label: 'Continue chat', tone: '' },
            { to: '/tools', icon: 'lightbulb', label: 'Study tools', tone: 'gold' },
            { to: '/books', icon: 'book-open', label: 'Explore books', tone: 'gold' },
            { to: '/gallery', icon: 'image', label: 'Open gallery', tone: '' },
          ].map((a) => (
            <Link key={a.label} to={a.to} className="quick-action card card-interactive">
              <div className={`icon-tile ${a.tone}`}><Icon name={a.icon} /></div>
              <span>{a.label}</span>
            </Link>
          ))}
        </div>

        <div className="dash-grid">
          <Card className="stack dash-stats">
            <div className="card-header" style={{ marginBottom: 0 }}><h2 className="card-title">Your activity</h2><Badge tone="primary">Last 7 days</Badge></div>
            {d ? (
              <>
                <div className="stat-row">
                  <div className="stat"><span className="stat-n">{d.stats.conversations}</span><span className="stat-l">Conversations</span></div>
                  <div className="stat"><span className="stat-n">{d.stats.messages}</span><span className="stat-l">Questions asked</span></div>
                  <div className="stat"><span className="stat-n">{d.stats.aiRequestsToday}<small>/{d.dailyLimit}</small></span><span className="stat-l">AI today</span></div>
                </div>
                <UsageBars daily={d.daily} />
              </>
            ) : <><Skeleton height={48} /><Skeleton height={120} /></>}
          </Card>

          <Card className="stack">
            <div className="card-header" style={{ marginBottom: 0 }}><h2 className="card-title">Recent conversations</h2><Link to="/chat" className="text-sm">View all</Link></div>
            {!d ? <><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></> : d.recent.length === 0 ? (
              <EmptyState icon="chat" title="Start your first conversation with Eman." action={<Button href="/chat?new=1" size="sm" icon="sparkles">Ask a question</Button>} />
            ) : (
              <ul className="list">
                {d.recent.map((c) => (
                  <li key={c.id}>
                    <Link to={`/chat/${c.id}`} className="list-item">
                      <div className="icon-tile sm"><Icon name={c.pinned ? 'pin' : 'chat'} /></div>
                      <div className="list-body"><p className="list-title">{c.title}</p>{c.preview && <p className="list-sub">{c.preview.replace(/[#*`>_]/g, '')}</p>}</div>
                      <span className="text-xs subtle">{timeAgo(c.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="stack">
            <div className="card-header" style={{ marginBottom: 0 }}><h2 className="card-title">Notifications {d?.unread ? <Badge tone="gold">{d.unread} new</Badge> : null}</h2><Link to="/notifications" className="text-sm">All</Link></div>
            {!d ? <Skeleton height={80} /> : d.notifications.length === 0 ? <p className="muted text-sm">You’re all caught up.</p> : (
              <ul className="list">
                {d.notifications.map((n) => (
                  <li key={n.id}>
                    <Link to={n.link || '/notifications'} className="list-item">
                      <span className={`dot ${n.read_at ? '' : 'dot-on'}`} aria-label={n.read_at ? 'Read' : 'Unread'} />
                      <div className="list-body"><p className="list-title">{n.title}</p>{n.body && <p className="list-sub">{n.body}</p>}</div>
                      <span className="text-xs subtle">{timeAgo(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="stack">
            <div className="card-header" style={{ marginBottom: 0 }}><h2 className="card-title">Favourite books</h2><Link to="/books" className="text-sm">Library</Link></div>
            {!d ? <Skeleton height={80} /> : d.favBooks.length === 0 ? (
              <p className="muted text-sm">Books you favourite will appear here.</p>
            ) : (
              <ul className="list">{d.favBooks.map((b) => <li key={b.id} className="list-item"><div className="icon-tile sm gold"><Icon name="book" /></div><div className="list-body"><p className="list-title">{b.title}</p><p className="list-sub">{b.author}</p></div></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
