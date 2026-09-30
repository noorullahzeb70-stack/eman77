// Theme handling: 'light' | 'dark' | 'system'. Stored in localStorage (and later
// synced to the user profile). The inline script in index.html applies it before
// first paint so there is no flash of the wrong theme.
import { useEffect, useState, useSyncExternalStore } from 'react';

const KEY = 'eman-theme';
const listeners = new Set();
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function read() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function resolveTheme(pref) {
  return pref === 'system' ? (mq?.matches ? 'dark' : 'light') : pref;
}

function apply(pref) {
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b0e0d' : '#fbfbfa');
}

export function setTheme(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* storage unavailable — keep in memory */ }
  apply(pref);
  listeners.forEach((l) => l());
}

mq?.addEventListener('change', () => { if (read() === 'system') { apply('system'); listeners.forEach((l) => l()); } });

export function useTheme() {
  const pref = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => 'system');
  return { pref, resolved: resolveTheme(pref), setTheme };
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
