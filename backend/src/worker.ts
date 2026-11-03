// Separate entry point from the API so any number of worker processes can be run
// (e.g. `npm run dev:worker` in two terminals). They coordinate only through Postgres and Redis.
import { env } from './config/env.js';
import { closeClients, logger } from './lib/clients.js';
import { closeTransports } from './services/mailer.service.js';
import { createEmailWorker } from './workers/email.worker.js';
import { reconcileScheduledEmails } from './workers/reconcile.js';

const worker = createEmailWorker();
await worker.waitUntilReady();
logger.info(
  {
    queue: env.QUEUE_NAME,
    concurrency: env.WORKER_CONCURRENCY,
    minDelayMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
    globalLimiter: env.GLOBAL_LIMITER_MAX > 0 ? `${env.GLOBAL_LIMITER_MAX}/${env.GLOBAL_LIMITER_DURATION_MS}ms` : 'off',
  },
  'Worker started',
);

// Make sure every unsent email in Postgres has a job in Redis (see reconcile.ts). A failure is
// logged, not fatal: existing jobs keep being processed, and the next worker start retries.
try {
  const result = await reconcileScheduledEmails();
  logger.info(result, 'Startup reconciliation finished');
} catch (err) {
  logger.error({ err }, 'Startup reconciliation failed');
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down worker; waiting for in-flight jobs');
  // close() stops fetching new jobs and resolves once the active ones finish, so no send is cut off
  // halfway. Delayed/waiting jobs stay in Redis for the next worker.
  await worker.close();
  closeTransports();
  await closeClients();
  logger.info('Worker stopped');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
