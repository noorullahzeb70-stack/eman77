// Auth state for the whole app.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, post, setCsrf } from './api.js';
import { setTheme } from './theme.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const d = await get('/api/auth/me');
      setCsrf(d.csrfToken);
      setState({ user: d.user, loading: false });
      return d.user;
    } catch {
      setState({ user: null, loading: false });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback((d) => {
    setCsrf(d.csrfToken);
    setState({ user: d.user, loading: false });
    if (d.user?.theme) setTheme(d.user.theme);
  }, []);

  const signOut = useCallback(async () => {
    try { await post('/api/auth/logout'); } catch { /* already signed out */ }
    setCsrf(null);
    setState({ user: null, loading: false });
  }, []);

  const updateUser = useCallback((user) => setState((s) => ({ ...s, user })), []);

  return <AuthCtx.Provider value={{ ...state, refresh, signIn, signOut, updateUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
