import { randomBytes } from 'node:crypto';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import { z } from 'zod';
import { devLoginEnabled, env, isProduction } from '../config/env.js';
import { OAUTH_STATE_TTL_SECONDS } from '../config/constants.js';
import { logger } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { SESSION_COOKIE, signSessionToken, signStateToken, verifyStateToken } from '../lib/tokens.js';
import { getAuthUserId, requireAuth } from '../middleware/require-auth.js';
import { buildGoogleAuthUrl, exchangeCodeForProfile } from '../services/google-oauth.service.js';
import { ensureDefaultSender } from '../services/sender.service.js';
import { findUserById, toPublicUser, upsertDevUser, upsertGoogleUser } from '../services/user.service.js';

export const authRouter = Router();

const OAUTH_NONCE_COOKIE = 'oauth_nonce';

// httpOnly: JS can't read the token (limits XSS damage). sameSite 'lax': the cookie isn't sent on
// cross-site POSTs (CSRF protection) but IS sent on the top-level redirect back from Google.
// localhost:3000 and localhost:4000 count as the same *site*, so the dashboard's fetches include it;
// deploying API and frontend on different sites would need sameSite 'none' + secure.
function cookieOptions(maxAgeMs?: number): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

function setSessionCookie(res: Response, userId: string): string {
  const token = signSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, cookieOptions(env.JWT_EXPIRES_IN_SECONDS * 1000));
  return token;
}

// Step 1: send the browser to Google's consent screen.
// CSRF protection: a random nonce goes both in a short-lived cookie and inside the signed `state`.
// On callback both must match, so a `state` obtained by an attacker can't be used in a victim's browser.
authRouter.get('/google', (_req, res) => {
  const nonce = randomBytes(16).toString('hex');
  const url = buildGoogleAuthUrl(signStateToken('google-oauth-state', { nonce }));
  res.cookie(OAUTH_NONCE_COOKIE, nonce, cookieOptions(OAUTH_STATE_TTL_SECONDS * 1000));
  res.redirect(url);
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

// Step 2: Google redirects back here. This is a browser navigation, so failures redirect
// to the frontend with an error code instead of returning JSON.
authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${reason}`);

  const nonce: unknown = req.cookies?.[OAUTH_NONCE_COOKIE];
  res.clearCookie(OAUTH_NONCE_COOKIE, cookieOptions());

  const query = callbackQuerySchema.safeParse(req.query);
  if (!query.success) return fail('invalid_request');
  const { code, state, error } = query.data;
  if (error) return fail('access_denied'); // user clicked "Cancel" on the consent screen

  const claims = state ? verifyStateToken(state, 'google-oauth-state') : null;
  if (!claims || typeof nonce !== 'string' || claims.nonce !== nonce) return fail('invalid_state');
  if (!code) return fail('missing_code');

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await upsertGoogleUser(profile);
    await ensureDefaultSender(user.id);
    setSessionCookie(res, user.id);
    logger.info({ userId: user.id }, 'Google login');
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback failed');
    fail('oauth_failed');
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await findUserById(getAuthUserId(req));
  if (!user) {
    // Valid token but the user was deleted: drop the stale cookie.
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    throw new HttpError(401, 'User no longer exists');
  }
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  // Sessions are stateless JWTs, so logout = removing the cookie (Bearer tokens simply expire).
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

const devLoginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(100).optional(),
});

// True only for a request made on this machine straight to the API (curl, the load-test script).
// Anything that came through a proxy or tunnel (the frontend's dev proxy, ngrok) carries an
// X-Forwarded-For header, and its socket isn't a loopback address.
function isDirectLocalRequest(req: Request): boolean {
  const address = req.socket.remoteAddress ?? '';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  return loopback && !req.headers['x-forwarded-for'];
}

// Postman / load-test shortcut that skips Google. Returns the token in the body for Bearer use.
// It logs in as ANY email without a password, so even when enabled it only answers requests made
// directly on this machine; once the app is reachable through ngrok, nobody outside can use it.
authRouter.post('/dev-login', async (req, res) => {
  // 404 rather than 403 so production doesn't even reveal that the route exists.
  if (!devLoginEnabled || !isDirectLocalRequest(req)) throw new HttpError(404, `Route not found: POST ${req.path}`);

  const { email, name } = devLoginSchema.parse(req.body);
  const user = await upsertDevUser(email, name);
  await ensureDefaultSender(user.id);
  const token = setSessionCookie(res, user.id);
  res.json({ token, user: toPublicUser(user) });
});
