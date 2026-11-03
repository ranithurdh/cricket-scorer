// Where the login token lives (localStorage). No imports, so api.js and auth.js can both use it.
const KEY = 'auth-v1';
export const ROLES = ['admin', 'scorer'];

export const readAuth = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v?.token && ROLES.includes(v.role) ? v : null;
  } catch { return null; }
};
export const writeAuth = (v) => {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};
export const getToken = () => readAuth()?.token ?? null;
