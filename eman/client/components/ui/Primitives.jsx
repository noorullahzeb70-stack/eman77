import { useEffect, useRef, useState, useId, createContext, useContext, useCallback } from 'react';
import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';

/* ── Card ── */
export function Card({ as: Tag = 'div', interactive, glass, className = '', children, ...rest }) {
  const cls = ['card', interactive && 'card-interactive', glass && 'card-glass', className].filter(Boolean).join(' ');
  return <Tag className={cls} {...rest}>{children}</Tag>;
}

/* ── Badge ── */
export function Badge({ tone = 'neutral', dot, icon, children }) {
  const cls = ['badge', tone !== 'neutral' && `badge-${tone}`, dot && 'badge-dot'].filter(Boolean).join(' ');
  return <span className={cls}>{icon && <Icon name={icon} />}{children}</span>;
}

/* ── Alert ── */
const ALERT_ICON = { info: 'info', success: 'check-circle', warning: 'alert', danger: 'alert-circle' };
export function Alert({ tone = 'info', title, children, action }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} />
      <div style={{ flex: 1 }}>
        {title && <p className="alert-title">{title}</p>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

/* ── Avatar ── */
export function Avatar({ name = '', src, size = 36 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return (
    <span className="avatar" style={{ '--size': `${size}px` }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}

/* ── Modal (native <dialog>: focus trap, Esc, backdrop handled by the browser) ── */
export function Modal({ open, onClose, title, children, footer, size }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      style={size ? { width: `min(${size}px, calc(100vw - 32px))` } : undefined}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose?.(); }}
      onClick={(e) => { if (e.target === ref.current) onClose?.(); }}
    >
      {open && (
        <>
          <div className="modal-header">
            <h2 className="modal-title" id={titleId}>{title}</h2>
            <Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ── Confirm dialog helper ── */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

/* ── Dropdown menu (keyboard: arrows, Home/End, Esc) ── */
export function Menu({ trigger, items, align = 'right', label = 'Options' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    wrap.current?.querySelector('[role=menuitem]')?.focus();
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);
  const onKey = (e) => {
    const els = [...(wrap.current?.querySelectorAll('[role=menuitem]') ?? [])];
    const i = els.indexOf(document.activeElement);
    if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector('[aria-haspopup]')?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els.at(-1)?.focus(); }
  };
  return (
    <div className="menu-wrap" ref={wrap} onKeyDown={onKey}>
      {trigger({ 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': menuId, 'aria-label': label, onClick: () => setOpen((o) => !o) })}
      {open && (
        <div className="menu" role="menu" id={menuId} data-align={align}>
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                tabIndex={-1}
                className={`menu-item ${it.danger ? 'danger' : ''}`}
                onClick={() => { setOpen(false); it.onSelect?.(); }}
              >
                {it.icon && <Icon name={it.icon} />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tabs (WAI-ARIA tabs pattern) ── */
export function Tabs({ tabs, value, onChange, label }) {
  const base = useId();
  const onKey = (e, i) => {
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (n !== null) {
      e.preventDefault();
      onChange(tabs[n].value);
      document.getElementById(`${base}-t-${n}`)?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          id={`${base}-t-${i}`}
          role="tab"
          className="tab"
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Skeletons ── */
export function Skeleton({ width = '100%', height = 12, radius, style, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}
export function SkeletonCard() {
  return (
    <div className="card stack" style={{ '--gap': 'var(--space-3)' }} aria-hidden="true">
      <Skeleton height={140} radius="var(--radius-md)" />
      <Skeleton height={18} width="70%" />
      <Skeleton height={12} />
      <Skeleton height={12} width="85%" />
    </div>
  );
}

export function TypingIndicator({ label = 'Eman is thinking' }) {
  return (
    <span className="typing" role="status" aria-label={label}>
      <span /><span /><span />
    </span>
  );
}

export function Progress({ value, label }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

/* ── Empty / error states ── */
export function EmptyState({ icon = 'inbox', title, text, action, error }) {
  return (
    <div className={`state ${error ? 'state-error' : ''}`} role={error ? 'alert' : undefined}>
      <div className="state-icon"><Icon name={icon} /></div>
      <p className="state-title">{title}</p>
      {text && <p className="state-text">{text}</p>}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
}

/* ── Toasts ── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toaster" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'error' ? 'alert-circle' : t.tone === 'info' ? 'info' : 'check-circle'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
