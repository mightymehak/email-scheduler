import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { SESSION_COOKIE, verifySessionToken } from '../lib/tokens.js';

// The browser sends the httpOnly cookie; Postman / scripts send `Authorization: Bearer <token>`.
function readToken(req: Request): string | undefined {
  const cookie: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === 'string' && cookie) return cookie;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return undefined;
}

// Stateless check: only verifies the JWT signature/expiry, no DB lookup per request.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) throw new HttpError(401, 'Not authenticated');
  req.userId = userId;
  next();
};

// Use in handlers behind requireAuth to get the user id as a non-optional string.
export function getAuthUserId(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'Not authenticated');
  return req.userId;
}
