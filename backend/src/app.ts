import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { JSON_BODY_LIMIT } from './config/constants.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { authRouter } from './routes/auth.routes.js';
import { BULL_BOARD_PATH, createBullBoardRouter } from './routes/bull-board.js';
import { campaignsRouter } from './routes/campaigns.routes.js';
import { emailsRouter } from './routes/emails.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { sendersRouter } from './routes/senders.routes.js';
import { slackRouter } from './routes/slack.routes.js';

// Builds the Express app without listening, so server.ts owns the process lifecycle.
export function createApp(): Express {
  const app = express();

  // Before helmet: Bull Board's page uses inline scripts, which helmet's default
  // Content-Security-Policy would block. It's a separate admin UI with its own basic auth.
  app.use(BULL_BOARD_PATH, ...createBullBoardRouter());

  app.use(helmet());
  // credentials: true lets the browser send the httpOnly session cookie cross-origin.
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(healthRouter);
  app.use('/auth', authRouter);

  // Everything under /api requires a logged-in user.
  app.use('/api/campaigns', requireAuth, campaignsRouter);
  app.use('/api/emails', requireAuth, emailsRouter);
  app.use('/api/senders', requireAuth, sendersRouter);
  // Except Slack's OAuth callback, so this router applies requireAuth per route itself.
  app.use('/api/slack', slackRouter);

  // Must be registered last: anything that reached here matched no route.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
