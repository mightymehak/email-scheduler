import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { OAUTH_STATE_TTL_SECONDS } from '../config/constants.js';

export const SESSION_COOKIE = 'session';

// Every token type gets its own JWT audience. All are signed with the same secret, so without
// this an OAuth state token (which we hand to Google/Slack) could be replayed as a session token.
type StateAudience = 'google-oauth-state' | 'slack-oauth-state';
type Audience = 'session' | StateAudience;

function sign(payload: object, audience: Audience, expiresInSeconds: number, subject?: string): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    audience,
    expiresIn: expiresInSeconds,
    ...(subject ? { subject } : {}),
  });
}

// Returns the claims, or null if the token is malformed, expired, or for another audience.
function verify(token: string, audience: Audience): jwt.JwtPayload | null {
  try {
    // Pinning the algorithm stops "alg: none" / algorithm-confusion tricks.
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], audience });
    return typeof claims === 'string' ? null : claims;
  } catch {
    return null;
  }
}

export function signSessionToken(userId: string): string {
  return sign({}, 'session', env.JWT_EXPIRES_IN_SECONDS, userId);
}

// Returns the userId stored in `sub`, or null if the token isn't a valid session.
export function verifySessionToken(token: string): string | null {
  return verify(token, 'session')?.sub ?? null;
}

export function signStateToken(audience: StateAudience, data: Record<string, string>): string {
  return sign(data, audience, OAUTH_STATE_TTL_SECONDS);
}

export function verifyStateToken(token: string, audience: StateAudience): jwt.JwtPayload | null {
  return verify(token, audience);
}
