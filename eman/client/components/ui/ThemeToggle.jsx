import { useTheme } from '../../lib/theme.js';
import { Icon } from './Icon.jsx';
import { Menu } from './Primitives.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

/** Compact theme switcher: icon button with Light / Dark / System menu. */
export function ThemeToggle() {
  const { pref, resolved, setTheme } = useTheme();
  return (
    <Menu
      label={`Theme: ${pref}`}
      trigger={(p) => (
        <button className="btn btn-ghost btn-icon" {...p}>
          <Icon name={resolved === 'dark' ? 'moon' : 'sun'} />
        </button>
      )}
      items={OPTIONS.map((o) => ({ label: o.value === pref ? `${o.label} ✓` : o.label, icon: o.icon, onSelect: () => setTheme(o.value) }))}
    />
  );
}

/** Segmented theme picker for the Settings page. */
export function ThemeSegmented() {
  const { pref, setTheme } = useTheme();
  return (
    <div className="tabs" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.value} role="radio" aria-checked={pref === o.value} aria-selected={pref === o.value} className="tab row" style={{ '--gap': '6px' }} onClick={() => setTheme(o.value)}>
          <Icon name={o.icon} size={16} /> {o.label}
        </button>
      ))}
    </div>
  );
}
