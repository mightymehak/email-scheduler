import type { Campaign, EmailStatus } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { MAX_SUBJECT_LENGTH, SCHEDULE_TRANSACTION_TIMEOUT_MS } from '../config/constants.js';
import { logger, prisma } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { buildPage, toSkipTake, type Page, type Pagination } from '../lib/pagination.js';
import { enqueueEmails } from '../queues/email.queue.js';
import { syncEmailsToSearch } from './search.service.js';
import { resolveSenderForUser, toPublicSender, type PublicSender } from './sender.service.js';

export const scheduleCampaignSchema = z.object({
  subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
  body: z.string().trim().min(1),
  // Raw strings: normalised and validated as addresses in normalizeRecipients().
  emails: z.array(z.string()).min(1),
  // Accepts an ISO string (e.g. "2026-11-02T15:00:00.000Z") or epoch milliseconds.
  // Custom messages because coercing a missing value gives zod's unhelpful "received NaN/Date".
  startTime: z.coerce.date({ error: 'startTime must be an ISO date string or epoch milliseconds' }),
  delayBetweenMs: z.coerce.number({ error: 'delayBetweenMs must be a number' }).int().min(0),
  hourlyLimit: z.coerce.number({ error: 'hourlyLimit must be a number' }).int().min(1),
  senderId: z.string().min(1).optional(),
});

export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;

const emailAddress = z.email();
// How many bad addresses to echo back in the error message.
const INVALID_SAMPLE_SIZE = 5;

// Lowercase + trim, drop blanks and duplicates (first occurrence keeps its position), then
// reject the whole request if any address is invalid rather than silently skipping some.
function normalizeRecipients(raw: string[]): string[] {
  const unique = [...new Set(raw.map((email) => email.trim().toLowerCase()).filter(Boolean))];

  if (unique.length === 0) throw new HttpError(400, 'No email addresses provided');
  if (unique.length > env.MAX_RECIPIENTS_PER_CAMPAIGN) {
    throw new HttpError(400, `Too many recipients: ${unique.length} (max ${env.MAX_RECIPIENTS_PER_CAMPAIGN})`);
  }

  const invalid = unique.filter((email) => !emailAddress.safeParse(email).success);
  if (invalid.length > 0) {
    const sample = invalid.slice(0, INVALID_SAMPLE_SIZE).join(', ');
    throw new HttpError(400, `${invalid.length} invalid email address(es), e.g. ${sample}`);
  }
  return unique;
}

export interface ScheduleCampaignResult {
  campaign: Campaign;
  sender: PublicSender;
  scheduledCount: number;
  firstSendAt: Date;
  lastSendAt: Date;
  // false = rows are saved but Redis was unavailable; reconciliation re-enqueues them on worker boot.
  enqueued: boolean;
}

export async function scheduleCampaign(userId: string, input: ScheduleCampaignInput): Promise<ScheduleCampaignResult> {
  const recipients = normalizeRecipients(input.emails);
  const sender = await resolveSenderForUser(userId, input.senderId);

  // A start time in the past means "start now".
  const startMs = Math.max(input.startTime.getTime(), Date.now());
  const sendTimeFor = (index: number) => new Date(startMs + index * input.delayBetweenMs);

  // Campaign + all its Email rows commit together or not at all, so there's never a campaign
  // with only some of its recipients saved.
  const { campaign, emails } = await prisma.$transaction(
    async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          userId,
          senderId: sender.id,
          subject: input.subject,
          body: input.body,
          startTime: new Date(startMs),
          delayBetweenMs: input.delayBetweenMs,
          hourlyLimit: input.hourlyLimit,
          totalEmails: recipients.length,
        },
      });
      const emails = await tx.email.createManyAndReturn({
        data: recipients.map((toEmail, sequence) => ({
          campaignId: campaign.id,
          userId,
          toEmail,
          subject: input.subject,
          body: input.body,
          sequence,
          originalScheduledAt: sendTimeFor(sequence),
          scheduledAt: sendTimeFor(sequence),
        })),
        select: { id: true, scheduledAt: true },
      });
      return { campaign, emails };
    },
    { timeout: SCHEDULE_TRANSACTION_TIMEOUT_MS },
  );

  // Enqueue AFTER the commit: a job must never point at a row that might be rolled back.
  // If Redis fails here the rows are already safe in Postgres, so we report it instead of
  // failing the request; the worker's startup reconciliation will create the missing jobs.
  let enqueued = true;
  try {
    await enqueueEmails(emails);
  } catch (err) {
    enqueued = false;
    logger.error({ err, campaignId: campaign.id }, 'Enqueue failed; emails will be recovered by reconciliation');
  }

  // Best effort (never throws): if Elasticsearch is down the emails still send; reindex repairs search.
  await syncEmailsToSearch(emails.map((email) => email.id));

  logger.info({ campaignId: campaign.id, count: emails.length, enqueued }, 'Campaign scheduled');
  return {
    campaign,
    sender: toPublicSender(sender),
    scheduledCount: emails.length,
    firstSendAt: sendTimeFor(0),
    lastSendAt: sendTimeFor(recipients.length - 1),
    enqueued,
  };
}

export interface CampaignSummary {
  id: string;
  subject: string;
  startTime: Date;
  delayBetweenMs: number;
  hourlyLimit: number;
  totalEmails: number;
  createdAt: Date;
  sender: { id: string; name: string; email: string };
  statusCounts: Record<EmailStatus, number>;
}

const emptyStatusCounts = (): Record<EmailStatus, number> => ({ SCHEDULED: 0, PROCESSING: 0, SENT: 0, FAILED: 0 });

export async function listCampaigns(userId: string, pagination: Pagination): Promise<Page<CampaignSummary>> {
  const [campaigns, total] = await prisma.$transaction([
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: { id: true, name: true, smtpUser: true } } },
      ...toSkipTake(pagination),
    }),
    prisma.campaign.count({ where: { userId } }),
  ]);

  // One grouped query for the whole page instead of one count query per campaign.
  const grouped = await prisma.email.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
    _count: { _all: true },
  });
  const countsByCampaign = new Map<string, Record<EmailStatus, number>>();
  for (const row of grouped) {
    const counts = countsByCampaign.get(row.campaignId) ?? emptyStatusCounts();
    counts[row.status] = row._count._all;
    countsByCampaign.set(row.campaignId, counts);
  }

  const items = campaigns.map((campaign) => ({
    id: campaign.id,
    subject: campaign.subject,
    startTime: campaign.startTime,
    delayBetweenMs: campaign.delayBetweenMs,
    hourlyLimit: campaign.hourlyLimit,
    totalEmails: campaign.totalEmails,
    createdAt: campaign.createdAt,
    sender: { id: campaign.sender.id, name: campaign.sender.name, email: campaign.sender.smtpUser },
    statusCounts: countsByCampaign.get(campaign.id) ?? emptyStatusCounts(),
  }));
  return buildPage(items, total, pagination);
}
