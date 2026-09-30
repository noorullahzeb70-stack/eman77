import { useEffect, useState } from 'react';
import { Link, useRouter } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { get } from '../../lib/api.js';
import { Logo } from '../ui/Logo.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Button, Spinner } from '../ui/Button.jsx';
import { Avatar, Menu } from '../ui/Primitives.jsx';
import { ThemeToggle } from '../ui/ThemeToggle.jsx';

const APP_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/chat', label: 'Ask Eman', icon: 'chat' },
  { to: '/tools', label: 'Study Tools', icon: 'lightbulb' },
  { to: '/education', label: 'Education', icon: 'graduation' },
  { to: '/books', label: 'Books', icon: 'book-open' },
  { to: '/gallery', label: 'Gallery', icon: 'image' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function useUnread() {
  const [n, setN] = useState(0);
  const { path } = useRouter();
  useEffect(() => {
    let alive = true;
    get('/api/notifications').then((d) => alive && setN(d.unread)).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  return n;
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const { navigate } = useRouter();
  return (
    <Menu
      label="Account"
      trigger={(p) => (
        <button className="user-chip" {...p}>
          <Avatar name={user.name} src={user.avatarUrl} size={32} />
          <span className="user-chip-name">{user.name.split(' ')[0]}</span>
          <Icon name="chevron-down" size={16} />
        </button>
      )}
      items={[
        { label: 'Profile & settings', icon: 'user', onSelect: () => navigate('/settings') },
        ...(user.role === 'admin' ? [{ label: 'Admin panel', icon: 'shield', onSelect: () => navigate('/admin') }] : []),
        { label: 'Public website', icon: 'globe', onSelect: () => navigate('/') },
        'sep',
        { label: 'Sign out', icon: 'logout', danger: true, onSelect: async () => { await signOut(); navigate('/'); } },
      ]}
    />
  );
}

export function AppLayout({ children, bare = false }) {
  const { user } = useAuth();
  const unread = useUnread();
  const nav = user?.role === 'admin' ? [...APP_NAV, { to: '/admin', label: 'Admin', icon: 'shield' }] : APP_NAV;
  return (
    <div className={`app-shell ${bare ? 'bare' : ''}`}>
      <aside className="app-sidebar" aria-label="App navigation">
        <Link to="/dashboard" className="brand" aria-label="EMAN dashboard"><Logo size={32} /></Link>
        {bare ? <div style={{ height: 'var(--space-5)' }} /> : <Button href="/chat?new=1" icon="plus" block style={{ margin: 'var(--space-5) 0 var(--space-3)' }}>New chat</Button>}
        <nav className="stack" style={{ '--gap': '2px' }}>
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="side-link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.to === '/notifications' && unread > 0 && <span className="count-badge" aria-label={`${unread} unread`}>{unread}</span>}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <Link to="/dashboard" className="brand app-topbar-brand" aria-label="EMAN dashboard"><Logo size={30} /></Link>
          <div className="header-actions">
            <Link to="/notifications" className="btn btn-ghost btn-icon notif-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Icon name="bell" />
              {unread > 0 && <span className="notif-dot" />}
            </Link>
            <ThemeToggle />
            {user && <UserMenu />}
          </div>
        </header>
        <main id="main" className={bare ? 'app-content-bare' : 'app-content has-bottom-nav'}>{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Quick navigation">
        <Link to="/dashboard"><Icon name="grid" />Home</Link>
        <Link to="/tools"><Icon name="lightbulb" />Tools</Link>
        <Link to="/chat" className="fab"><Icon name="sparkles" /><span>Ask</span></Link>
        <Link to="/books"><Icon name="book-open" />Library</Link>
        <Link to="/settings"><Icon name="user" />Me</Link>
      </nav>
    </div>
  );
}

/** Redirects to /login if signed out; optionally requires a role. */
export function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const { path, navigate } = useRouter();
  useEffect(() => {
    if (!loading && !user) navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true });
  }, [loading, user, path, navigate]);
  if (loading || !user) {
    return <div className="page-loader"><Spinner label="Loading" /></div>;
  }
  if (role && user.role !== role) {
    return (
      <AppLayout>
        <div className="state state-error">
          <div className="state-icon"><Icon name="lock" /></div>
          <p className="state-title">You don’t have access to this page.</p>
          <p className="state-text">This area is for administrators.</p>
          <Button href="/dashboard" variant="secondary">Back to dashboard</Button>
        </div>
      </AppLayout>
    );
  }
  return children;
}
