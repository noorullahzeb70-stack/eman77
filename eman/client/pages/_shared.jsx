// Shared building blocks for simple public pages.
import { Icon } from '../components/ui/Icon.jsx';

export function PageHero({ eyebrow, title, text, children }) {
  return (
    <section className="page-hero">
      <div className="hero-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /></div>
      <div className="container animate-in">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display page-title">{title}</h1>
        {text && <p className="page-lead muted">{text}</p>}
        {children}
      </div>
    </section>
  );
}

export function FeatureList({ items }) {
  return (
    <div className="grid" style={{ '--min': '260px' }}>
      {items.map((f) => (
        <div key={f.title} className="card feature-row">
          <div className="icon-tile"><Icon name={f.icon} /></div>
          <div>
            <h3 className="cap-title">{f.title}</h3>
            <p className="muted text-sm">{f.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
