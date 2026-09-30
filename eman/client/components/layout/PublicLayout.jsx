import { useEffect, useState } from 'react';
import { Link, useRouter } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { Logo } from '../ui/Logo.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Button } from '../ui/Button.jsx';
import { ThemeToggle } from '../ui/ThemeToggle.jsx';

export const PUBLIC_NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/ai', label: 'AI', icon: 'sparkles' },
  { to: '/education', label: 'Education', icon: 'graduation' },
  { to: '/books', label: 'Books', icon: 'book-open' },
  { to: '/gallery', label: 'Gallery', icon: 'image' },
  { to: '/features', label: 'Features', icon: 'layers' },
  { to: '/about', label: 'About', icon: 'info' },
  { to: '/contact', label: 'Contact', icon: 'mail' },
];

function MobileDrawer({ open, onClose }) {
  const { user } = useAuth();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer-panel" aria-label="Main">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <Logo size={30} />
          <Button variant="ghost" iconOnly icon="x" aria-label="Close menu" onClick={onClose} autoFocus />
        </div>
        {PUBLIC_NAV.map((n) => (
          <Link key={n.to} to={n.to} className="nav-link" onClick={onClose}><Icon name={n.icon} />{n.label}</Link>
        ))}
        <hr className="divider" style={{ margin: 'var(--space-3) 0' }} />
        {user ? (
          <Button href="/dashboard" onClick={onClose} icon="grid" block>Open dashboard</Button>
        ) : (
          <div className="stack" style={{ '--gap': 'var(--space-2)' }}>
            <Button href="/register" onClick={onClose} block icon="sparkles">Create free account</Button>
            <Button href="/login" onClick={onClose} variant="secondary" block>Sign in</Button>
          </div>
        )}
      </nav>
    </div>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" aria-label="EMAN home" className="brand"><Logo /></Link>
        <nav className="nav-links" aria-label="Main">
          {PUBLIC_NAV.slice(1).map((n) => <Link key={n.to} to={n.to} className="nav-link">{n.label}</Link>)}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {user ? (
            <Button href="/dashboard" size="sm" icon="grid" className="header-desktop-only">Dashboard</Button>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm" className="header-desktop-only">Sign in</Button>
              <Button href="/register" size="sm" className="header-desktop-only">Get started</Button>
            </>
          )}
          <Button variant="ghost" iconOnly icon="menu" className="header-mobile-only" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} />
        </div>
      </div>
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="stack" style={{ '--gap': 'var(--space-3)', maxWidth: 320 }}>
            <Logo />
            <p className="muted">Your intelligent companion for learning, knowledge and creativity.</p>
          </div>
          <div className="stack" style={{ '--gap': 'var(--space-2)' }}>
            <p className="footer-h">Explore</p>
            <Link to="/ai">AI Assistant</Link>
            <Link to="/education">Education</Link>
            <Link to="/books">Books</Link>
            <Link to="/gallery">Gallery</Link>
          </div>
          <div className="stack" style={{ '--gap': 'var(--space-2)' }}>
            <p className="footer-h">EMAN</p>
            <Link to="/about">About</Link>
            <Link to="/features">Features</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <div className="stack" style={{ '--gap': 'var(--space-2)' }}>
            <p className="footer-h">Legal</p>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/ai-notice">AI Usage Notice</Link>
          </div>
        </div>
        <hr className="divider" style={{ margin: 'var(--space-8) 0 var(--space-5)' }} />
        <p className="subtle text-xs">© {year} EMAN. AI answers can contain mistakes — check important information.</p>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
