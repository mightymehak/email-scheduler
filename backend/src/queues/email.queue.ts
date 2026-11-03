import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import {
  COMPLETED_JOB_RETENTION_SECONDS,
  ENQUEUE_CHUNK_SIZE,
  FAILED_JOB_RETENTION_SECONDS,
} from '../config/constants.js';
import { createRedis } from '../lib/clients.js';

// The job only carries the row id: Postgres is the source of truth, so the worker always
// reads the latest state (status, scheduledAt, sender) instead of a stale copy in Redis.
export interface SendEmailJobData {
  emailId: string;
}

export const SEND_EMAIL_JOB = 'send-email';

export const emailQueue = new Queue<SendEmailJobData>(env.QUEUE_NAME, {
  connection: createRedis('queue', { failFast: true }),
  defaultJobOptions: {
    attempts: env.JOB_ATTEMPTS,
    // Real SMTP failures retry after JOB_BACKOFF_MS, then 2x, 4x, ...
    backoff: { type: 'exponential', delay: env.JOB_BACKOFF_MS },
    removeOnComplete: { age: COMPLETED_JOB_RETENTION_SECONDS },
    removeOnFail: { age: FAILED_JOB_RETENTION_SECONDS },
  },
});

export interface EmailToEnqueue {
  id: string;
  scheduledAt: Date;
}

// One delayed job per email. BullMQ keeps delayed jobs in a Redis sorted set scored by run time
// and promotes them when due, so there is no polling loop or cron anywhere.
// jobId = email.id makes enqueueing idempotent: BullMQ ignores an add whose jobId already exists,
// so retrying this function (or the restart reconciliation) never creates duplicate jobs.
export async function enqueueEmails(emails: EmailToEnqueue[]): Promise<void> {
  for (let start = 0; start < emails.length; start += ENQUEUE_CHUNK_SIZE) {
    const chunk = emails.slice(start, start + ENQUEUE_CHUNK_SIZE);
    const now = Date.now();
    await emailQueue.addBulk(
      chunk.map((email) => ({
        name: SEND_EMAIL_JOB,
        data: { emailId: email.id },
        opts: { jobId: email.id, delay: Math.max(0, email.scheduledAt.getTime() - now) },
      })),
    );
  }
}
