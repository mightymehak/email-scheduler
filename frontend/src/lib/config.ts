// Read once at startup. Vite inlines import.meta.env values at build time.
// Empty (the default) = the API is on the same domain as this page: the Vite server proxies
// /api, /auth, /admin and /health to it (see vite.config.ts). Set it only if the API runs on a
// different domain.
const apiUrl = import.meta.env.VITE_API_URL ?? '';

// Strip a trailing slash so `${API_URL}/auth/me` never becomes "//auth/me".
export const API_URL = apiUrl.replace(/\/+$/, '');
