import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { RequestHandler } from 'express';
import { env, isProduction } from '../config/env.js';
import { logger } from '../lib/clients.js';
import { basicAuth } from '../middleware/basic-auth.js';
import { emailQueue } from '../queues/email.queue.js';

export const BULL_BOARD_PATH = '/admin/queues';

// Live BullMQ dashboard: delayed / waiting / active / completed / failed jobs for the email queue.
// It reads straight from Redis, so it shows the real queue state of every worker.
export function createBullBoardRouter(): RequestHandler[] {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });

  const { BULL_BOARD_USER, BULL_BOARD_PASS } = env;
  if (BULL_BOARD_USER && BULL_BOARD_PASS) {
    return [basicAuth(BULL_BOARD_USER, BULL_BOARD_PASS, 'Bull Board'), serverAdapter.getRouter()];
  }
  // Open access is convenient locally, but the board can retry and delete jobs, so say so loudly.
  if (isProduction) logger.warn('Bull Board is NOT protected: set BULL_BOARD_USER and BULL_BOARD_PASS');
  return [serverAdapter.getRouter()];
}
