import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

// Hashing both sides first gives equal-length buffers (timingSafeEqual requires that), so the
// comparison takes the same time whether a guess is close or not and leaks nothing about the length.
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// HTTP basic auth: the browser shows its own login prompt after the 401 + WWW-Authenticate header.
export function basicAuth(user: string, pass: string, realm: string): RequestHandler {
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      // Check both, always, so the response time doesn't reveal which half was wrong.
      const userOk = safeEqual(decoded.slice(0, separator), user);
      const passOk = safeEqual(decoded.slice(separator + 1), pass);
      if (separator !== -1 && userOk && passOk) return next();
    }
    res.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    res.status(401).send('Authentication required');
  };
}
