// Web token storage. localStorage is fine for a prototype; consider an
// httpOnly cookie set by the server route for production.
const KEY = 'edt_token';

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getToken = async () => safe(() => localStorage.getItem(KEY), null);
export const setToken = async (token: string) => safe(() => localStorage.setItem(KEY, token), undefined);
export const clearToken = async () => safe(() => localStorage.removeItem(KEY), undefined);
