import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { createRedis, logger } from '../lib/clients.js';
import type { SendEmailJobData } from '../queues/email.queue.js';
import { processEmailJob, type EmailJobResult } from './email.processor.js';

export function createEmailWorker(): Worker<SendEmailJobData, EmailJobResult> {
  const worker = new Worker<SendEmailJobData, EmailJobResult>(env.QUEUE_NAME, processEmailJob, {
    connection: createRedis('worker'),
    // Jobs processed in parallel by THIS process. Total parallelism = concurrency x worker processes;
    // correctness doesn't depend on it because claims and rate limits are enforced in Postgres/Redis.
    concurrency: env.WORKER_CONCURRENCY,
    // Optional cap on jobs/second across ALL workers, enforced by BullMQ in Redis.
    ...(env.GLOBAL_LIMITER_MAX > 0
      ? { limiter: { max: env.GLOBAL_LIMITER_MAX, duration: env.GLOBAL_LIMITER_DURATION_MS } }
      : {}),
  });

  // Not fired for DelayedError (throttling/rescheduling), only for real failed attempts.
  worker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'Job attempt failed');
  });
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));

  return worker;
}
