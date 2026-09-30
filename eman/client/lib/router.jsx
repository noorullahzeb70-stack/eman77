// Minimal client router (History API). Routes can be lazy components.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const RouterCtx = createContext({ path: '/', query: new URLSearchParams(), navigate: () => {} });

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event('eman:navigate'));
}

function current() {
  return { path: location.pathname.replace(/\/+$/, '') || '/', query: new URLSearchParams(location.search) };
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const on = () => {
      setLoc(current());
      if (!location.hash) window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', on);
    window.addEventListener('eman:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('eman:navigate', on);
    };
  }, []);
  const nav = useCallback((to, o) => navigate(to, o), []);
  return <RouterCtx.Provider value={{ ...loc, navigate: nav }}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

/** Match `/books/:id` style patterns. Returns params or null. */
export function matchPath(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const sp = path.split('/').filter(Boolean);
  if (pattern.endsWith('/*')) {
    if (sp.length < pp.length - 1) return null;
  } else if (pp.length !== sp.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (p === '*') break;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(sp[i]);
    else if (p !== sp[i]) return null;
  }
  return params;
}

export function Link({ to, children, onClick, activeExact, ...rest }) {
  const { path } = useRouter();
  const active = activeExact ? path === to : to !== '/' ? path === to || path.startsWith(to + '/') : path === '/';
  return (
    <a
      href={to}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
