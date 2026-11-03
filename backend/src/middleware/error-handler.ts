import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/clients.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
};

// Express 5 forwards both thrown errors and rejected promises from async handlers here.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', fields: z.flattenError(err).fieldErrors });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Errors from Express' own middleware (e.g. malformed JSON, body too large) carry a 4xx status.
  const status: unknown = err?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message });
    return;
  }
  logger.error({ err }, 'Unhandled request error');
  // Don't leak internals (stack traces, SQL) to the client.
  res.status(500).json({ error: 'Internal server error' });
};
