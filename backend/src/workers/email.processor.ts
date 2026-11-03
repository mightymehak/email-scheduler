import { DelayedError, type Job } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { EARLY_JOB_TOLERANCE_MS, MAX_ERROR_LENGTH } from '../config/constants.js';
import { logger, prisma } from '../lib/clients.js';
import type { SendEmailJobData } from '../queues/email.queue.js';
import { sendEmail } from '../services/mailer.service.js';
import {
  acquireSendSlot,
  computeDeferredSendTime,
  startSendCooldown,
  type LimitScope,
} from '../services/rate-limit.service.js';
import { syncEmailsToSearch } from '../services/search.service.js';
import { notifyRateLimitHit } from '../services/slack-notifier.service.js';

export type EmailJobResult = { outcome: 'sent'; messageId: string } | { outcome: 'skipped'; reason: string };

const isFinished = (status: EmailStatus) => status === EmailStatus.SENT || status === EmailStatus.FAILED;

// Puts the job back in BullMQ's delayed set until `timestamp`. Throwing DelayedError tells BullMQ
// the job was intentionally rescheduled: it is not a failure and does not use up a retry attempt.
async function delayUntil(job: Job<SendEmailJobData>, token: string | undefined, timestamp: number): Promise<never> {
  await job.moveToDelayed(timestamp, token);
  throw new DelayedError();
}

// Atomic claim. The WHERE clause is the lock: Postgres runs the conditional UPDATE as one step,
// so if two workers race for the same email only one gets count = 1.
// A PROCESSING row whose lock is older than STALE_LOCK_MS belonged to a worker that crashed
// mid-send, so it may be taken over.
async function claimEmail(emailId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - env.STALE_LOCK_MS);
  const { count } = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: EmailStatus.SCHEDULED },
        { status: EmailStatus.PROCESSING, lockedAt: { lt: staleBefore } },
      ],
    },
    data: { status: EmailStatus.PROCESSING, lockedAt: new Date() },
  });
  return count === 1;
}

// Undo a claim when we decide not to send right now (throttled), so the next run can claim it.
async function releaseClaim(emailId: string): Promise<void> {
  await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.PROCESSING },
    data: { status: EmailStatus.SCHEDULED, lockedAt: null },
  });
}

// Hourly limit hit: release the claim AND record the new send time on the row, so the dashboard
// shows when it will really go out and restart reconciliation re-creates the job at that time.
async function deferToNextSlot(emailId: string, sendAt: Date): Promise<void> {
  await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.PROCESSING },
    data: { status: EmailStatus.SCHEDULED, lockedAt: null, scheduledAt: sendAt, deferrals: { increment: 1 } },
  });
}

export async function processEmailJob(job: Job<SendEmailJobData>, token?: string): Promise<EmailJobResult> {
  const { emailId } = job.data;
  const log = logger.child({ emailId, jobId: job.id });

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    // The email's own sender (a campaign can be split across several) and the campaign's limit.
    include: { sender: true, campaign: true },
  });
  if (!email) return { outcome: 'skipped', reason: 'email no longer exists' };
  if (isFinished(email.status)) return { outcome: 'skipped', reason: `already ${email.status}` };

  // The row, not the job, decides when to send. If they ever disagree, wait for the row's time.
  if (email.scheduledAt.getTime() > Date.now() + EARLY_JOB_TOLERANCE_MS) {
    return delayUntil(job, token, email.scheduledAt.getTime());
  }

  // Step 1: idempotent claim.
  if (!(await claimEmail(emailId))) {
    const current = await prisma.email.findUnique({ where: { id: emailId }, select: { status: true } });
    if (!current || isFinished(current.status)) {
      return { outcome: 'skipped', reason: `already ${current?.status ?? 'deleted'}` };
    }
    // Another worker holds a fresh lock (e.g. a duplicate delivery of this job). Check back once
    // that lock would count as stale: by then it's either SENT, or its worker died and we take over.
    log.warn('Email locked by another worker; checking again later');
    return delayUntil(job, token, Date.now() + env.STALE_LOCK_MS);
  }

  // Step 2: throttling. One atomic Redis check for the min gap, the sender's hourly limit and the
  // campaign's hourly limit. Nothing is counted unless all three pass.
  const { campaignId } = email;
  const { senderId } = email;
  const slot = await acquireSendSlot({
    senderId,
    campaignId,
    senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaignLimit: email.campaign.hourlyLimit,
    gapMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
  });

  if (slot.code === 'GAP') {
    // Seconds-long wait: the row's scheduledAt stays as is. No search re-index for the brief
    // SCHEDULED -> PROCESSING -> SCHEDULED bounce: both are in the "scheduled" tab anyway.
    await releaseClaim(emailId);
    return delayUntil(job, token, Date.now() + slot.retryInMs);
  }

  if (slot.code === 'SENDER_LIMIT' || slot.code === 'CAMPAIGN_LIMIT') {
    // Never fail or drop the email: move it to the next free slot in a later hour window.
    const scope: LimitScope =
      slot.code === 'SENDER_LIMIT'
        ? { kind: 'sender', senderId, limit: env.MAX_EMAILS_PER_HOUR_PER_SENDER }
        : { kind: 'campaign', campaignId, limit: email.campaign.hourlyLimit };
    const sendAt = await computeDeferredSendTime(email, scope, env.MIN_DELAY_BETWEEN_SENDS_MS);
    await deferToNextSlot(emailId, sendAt);
    await syncEmailsToSearch([emailId]);
    log.info({ limit: slot.code, hourlyLimit: scope.limit, sendAt }, 'Hourly limit reached; email deferred');
    // Awaited but safe: it never throws, and after the first alert of the hour it's one Redis EXISTS.
    await notifyRateLimitHit({
      userId: email.campaign.userId,
      limitKind: scope.kind,
      limit: scope.limit,
      sender: email.sender,
      campaign: { id: campaignId, subject: email.campaign.subject },
    });
    return delayUntil(job, token, sendAt.getTime());
  }

  // Step 3: send. Only the SMTP call is inside try/catch, so a DB error after a successful send
  // is never mistaken for a send failure (which would put the row back to SCHEDULED and resend it).
  let sent;
  let sentAt: Date;
  try {
    sent = await sendEmail(email.sender, {
      id: email.id,
      to: email.toEmail,
      subject: email.subject,
      body: email.body,
    });
    sentAt = new Date();
  } catch (err) {
    // attemptsMade counts previous failed attempts, so this run is attempt number attemptsMade + 1.
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const message = err instanceof Error ? err.message : String(err);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: isLastAttempt ? EmailStatus.FAILED : EmailStatus.SCHEDULED,
        lockedAt: null,
        attempts: { increment: 1 },
        error: message.slice(0, MAX_ERROR_LENGTH),
      },
    });
    await syncEmailsToSearch([emailId]);
    log.warn({ err: message, attempt: job.attemptsMade + 1, isLastAttempt }, 'Send failed');
    // Rethrow so BullMQ schedules the retry with exponential backoff (or marks the job failed).
    throw err;
  } finally {
    // The next send from this sender may start MIN_DELAY_BETWEEN_SENDS_MS after this one finished.
    await startSendCooldown(senderId);
  }

  // If this update throws, the email WAS sent: the row stays PROCESSING with a fresh lock, so retries
  // of this job skip it instead of resending (they wait for the lock to go stale first).
  await prisma.email.update({
    where: { id: emailId },
    data: {
      status: EmailStatus.SENT,
      sentAt,
      lockedAt: null,
      attempts: { increment: 1 },
      messageId: sent.messageId,
      previewUrl: sent.previewUrl,
      error: null,
    },
  });
  await syncEmailsToSearch([emailId]);
  log.info({ to: email.toEmail, sender: email.sender.smtpUser, previewUrl: sent.previewUrl }, 'Email sent');
  return { outcome: 'sent', messageId: sent.messageId };
}
