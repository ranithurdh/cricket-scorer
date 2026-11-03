import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { login as loginRequest } from './api';
import { readAuth, writeAuth } from './authStore';

// Used once, in App, and shared through AuthContext.
//   scorer: can score.   admin: can score + delete matches + Settings + backup.   nobody signed in: view only.
export function useAuthState() {
  const [auth, setAuth] = useState(readAuth);
  const set = useCallback((v) => { writeAuth(v); setAuth(v); }, []);

  // api.js fires this when the server says our token is no longer good (expired, or the passwords were changed)
  useEffect(() => {
    const out = () => set(null);
    window.addEventListener('auth:expired', out);
    return () => window.removeEventListener('auth:expired', out);
  }, [set]);

  const login = useCallback(async (password) => {
    const r = await loginRequest(password);
    set({ token: r.token, role: r.role });
    return r.role;
  }, [set]);
  const logout = useCallback(() => set(null), [set]);

  return useMemo(() => ({
    role: auth?.role ?? null,
    canScore: auth?.role === 'scorer' || auth?.role === 'admin',
    isAdmin: auth?.role === 'admin',
    login, logout,
  }), [auth, login, logout]);
}

export const AuthContext = createContext(null);
const FALLBACK = { role: null, canScore: false, isAdmin: false, login: async () => null, logout() {} };
export const useAuth = () => useContext(AuthContext) ?? FALLBACK;
