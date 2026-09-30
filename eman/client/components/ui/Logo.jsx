// EMAN logo — "Lamp of Knowledge": an open book whose pages rise toward a
// four-point spark of light. Emerald = knowledge & trust, gold = light & warmth.
import { useId } from 'react';

export function LogoMark({ size = 34, className }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14a386" />
          <stop offset="0.55" stopColor="#0c6959" />
          <stop offset="1" stopColor="#0d453c" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="24" y1="6" x2="40" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4d98f" />
          <stop offset="1" stopColor="#e8a92f" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id}g)`} />
      <path d="M32 50c-5.5-4-12.5-5.2-20-3.8V26.4c7.5-1.4 14.5-.2 20 3.8V50z" fill="#fff" fillOpacity="0.95" />
      <path d="M32 50c5.5-4 12.5-5.2 20-3.8V26.4c-7.5-1.4-14.5-.2-20 3.8V50z" fill="#fff" fillOpacity="0.72" />
      <path d="M32 7.5l2.3 6.2 6.2 2.3-6.2 2.3L32 24.5l-2.3-6.2-6.2-2.3 6.2-2.3L32 7.5z" fill={`url(#${id}s)`} />
    </svg>
  );
}

export function Logo({ size = 34, showWord = true, className }) {
  return (
    <span className={`brand ${className ?? ''}`}>
      <LogoMark size={size} className="brand-mark" />
      {showWord && <span className="brand-word">EMAN</span>}
    </span>
  );
}
