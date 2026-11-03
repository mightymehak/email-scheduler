import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { RECONCILE_BATCH_SIZE } from '../config/constants.js';
import { logger, prisma } from '../lib/clients.js';
import { emailQueue, enqueueEmails, type EmailToEnqueue } from '../queues/email.queue.js';

export interface ReconcileResult {
  releasedLocks: number;
  checked: number;
  requeued: number;
  requeuedOverdue: number;
}

// Job states that mean "this job will still run": leave those alone.
// (An 'active' job of a crashed worker is moved back to 'wait' by BullMQ's stalled-job check.)
const LIVE_STATES = new Set(['delayed', 'waiting', 'active', 'prioritized', 'waiting-children']);

// Runs when a worker starts. Postgres is the source of truth, so every unsent row must have a
// live job in Redis; this re-creates any that are missing. Cases it repairs:
//   - Redis lost jobs (restarted without its append-only file, flushed, a different Redis...)
//   - the API committed a campaign but enqueueing failed (it returned enqueued: false)
//   - a job finished without the row being finished (completed/failed job, row still unsent)
//
// Safe to run any number of times and from several workers at once: jobId = email.id, so adding
// a job that already exists is a no-op, and SENT/FAILED rows are never selected.
export async function reconcileScheduledEmails(): Promise<ReconcileResult> {
  await emailQueue.waitUntilReady();

  // Step 1: a PROCESSING row with an old lock belonged to a worker that died mid-send.
  // Put it back to SCHEDULED so it is sent again (see README: at-least-once edge case).
  const staleBefore = new Date(Date.now() - env.STALE_LOCK_MS);
  const { count: releasedLocks } = await prisma.email.updateMany({
    where: { status: EmailStatus.PROCESSING, lockedAt: { lt: staleBefore } },
    data: { status: EmailStatus.SCHEDULED, lockedAt: null },
  });

  // Step 2: walk all unsent rows in id order (keyset pagination, so memory stays flat for any size).
  // PROCESSING rows with a fresh lock are included too: if their job is gone, the re-created job
  // waits for the lock to go stale (see claimEmail) instead of sending twice.
  let checked = 0;
  let requeued = 0;
  let requeuedOverdue = 0;
  let lastId: string | undefined;
  for (;;) {
    const rows = await prisma.email.findMany({
      where: { status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING] } },
      select: { id: true, scheduledAt: true },
      orderBy: { id: 'asc' },
      take: RECONCILE_BATCH_SIZE,
      ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;
    checked += rows.length;

    // One state lookup per row, sent concurrently over the same connection.
    const states = await Promise.all(rows.map((row) => emailQueue.getJobState(row.id)));
    const missing: EmailToEnqueue[] = [];
    for (const [i, row] of rows.entries()) {
      const state = states[i]!;
      if (LIVE_STATES.has(state)) continue;
      // A completed/failed job still occupies the jobId, and add() would silently ignore the
      // new job, so remove the old one first. 'unknown' = no job at all.
      if (state === 'completed' || state === 'failed') await emailQueue.remove(row.id);
      missing.push(row);
    }

    // enqueueEmails uses delay = scheduledAt - now, floored at 0: overdue rows run right away,
    // future rows keep their time. Rate limits still apply when they run.
    await enqueueEmails(missing);
    requeued += missing.length;
    requeuedOverdue += missing.filter((row) => row.scheduledAt.getTime() <= Date.now()).length;
  }

  return { releasedLocks, checked, requeued, requeuedOverdue };
}
