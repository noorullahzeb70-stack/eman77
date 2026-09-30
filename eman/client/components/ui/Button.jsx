import { forwardRef } from 'react';
import { Icon } from './Icon.jsx';
import { navigate } from '../../lib/router.jsx';

export function Spinner({ className = '', label }) {
  return (
    <svg className={`spinner ${className}`} viewBox="0 0 24 24" fill="none" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Button — variants: primary | secondary | soft | ghost | danger | gold
 * sizes: sm | md | lg. Pass `href` to render a link styled as a button.
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconRight, block, iconOnly, href, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    block && 'btn-block',
    iconOnly && 'btn-icon',
    className,
  ].filter(Boolean).join(' ');
  const content = (
    <>
      {loading && <Spinner />}
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </>
  );
  if (href) {
    const { onClick, target } = rest;
    // Internal links navigate client-side (no full page reload).
    const handle = (e) => {
      onClick?.(e);
      if (e.defaultPrevented || target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !href.startsWith('/') || href.startsWith('/api/')) return;
      e.preventDefault();
      navigate(href);
    };
    return (
      <a ref={ref} href={href} className={cls} data-loading={loading || undefined} aria-disabled={disabled || undefined} {...rest} onClick={handle}>
        {content}
      </a>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} data-loading={loading || undefined} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});
