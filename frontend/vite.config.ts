import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // '' prefix: also read non-VITE_ variables, like API_PROXY_TARGET, from frontend/.env.
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:4000';

  // The browser only ever talks to this server; these paths are passed on to the API. Frontend and
  // API therefore share one domain (localhost:3000, or the public ngrok URL), so the login cookie
  // is first-party and one tunnel exposes the whole app.
  // xfwd adds X-Forwarded-For, so the API knows these requests were forwarded and refuses the
  // local-only dev-login for them (whether they came from ngrok or a browser).
  const proxy: Record<string, ProxyOptions> = Object.fromEntries(
    ['/api', '/auth', '/admin', '/health'].map((path) => [path, { target: apiTarget, xfwd: true }]),
  );
  // Vite rejects requests for unknown hostnames (DNS-rebinding protection); allow ngrok's.
  const allowedHosts = ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app'];

  // Port 3000 must match FRONTEND_URL in backend/.env; strictPort fails loudly instead of
  // silently moving to 3001.
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 3000, strictPort: true, proxy, allowedHosts },
    // `npm run serve`: the production build, served with the same proxy (what reviewers use).
    preview: { port: 3000, strictPort: true, proxy, allowedHosts },
  };
});
