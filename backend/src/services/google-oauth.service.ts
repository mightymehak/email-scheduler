import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

let client: OAuth2Client | undefined;

// Created lazily and reused: the client caches Google's signing certificates between logins.
function getClient(): OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new HttpError(503, 'Google login is not configured on this server');
  }
  client ??= new OAuth2Client({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  });
  return client;
}

export function buildGoogleAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    // We only need identity, not offline access to the user's Google data.
    scope: ['openid', 'email', 'profile'],
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
}

// Exchanges the one-time `code` for tokens and returns the verified identity from the id_token.
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const oauth = getClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw new Error('Google did not return an id_token');

  // Checks the signature against Google's certs, plus issuer, expiry and that it was issued for OUR client.
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) {
    throw new Error('Google account has no verified email');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  };
}
