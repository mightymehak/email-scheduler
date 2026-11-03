import { EmailStatus, type Prisma } from '@prisma/client';
import { BODY_PREVIEW_LENGTH } from '../config/constants.js';
import { prisma } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { buildPage, toSkipTake, type Page, type Pagination } from '../lib/pagination.js';

export type EmailTab = 'scheduled' | 'sent';

// Which statuses each dashboard tab shows. PROCESSING belongs to "scheduled": it hasn't been sent yet.
export const TAB_STATUSES: Record<EmailTab, EmailStatus[]> = {
  scheduled: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING],
  sent: [EmailStatus.SENT, EmailStatus.FAILED],
};

// Scheduled: next to go out first. Sent: most recently finished first. updatedAt is used rather
// than sentAt because FAILED rows have no sentAt, and a SENT/FAILED row is never modified after
// it finishes, so updatedAt is exactly when it was sent or gave up.
const TAB_ORDER: Record<EmailTab, Prisma.EmailOrderByWithRelationInput[]> = {
  scheduled: [{ scheduledAt: 'asc' }, { sequence: 'asc' }],
  sent: [{ updatedAt: 'desc' }],
};

const emailListSelect = {
  id: true,
  campaignId: true,
  toEmail: true,
  subject: true,
  status: true,
  sequence: true,
  originalScheduledAt: true,
  scheduledAt: true,
  sentAt: true,
  updatedAt: true,
  attempts: true,
  deferrals: true,
  previewUrl: true,
  error: true,
  body: true,
} satisfies Prisma.EmailSelect;

type EmailListRow = Prisma.EmailGetPayload<{ select: typeof emailListSelect }>;
// Rows carry a short preview of the body (shown after the subject), never the whole body.
export type EmailListItem = Omit<EmailListRow, 'body'> & { preview: string };

export function bodyPreview(body: string): string {
  // Collapse newlines/spaces so the preview fits on one line.
  return body.replace(/\s+/g, ' ').trim().slice(0, BODY_PREVIEW_LENGTH);
}

// status narrows the tab to one status (e.g. only FAILED in the Sent tab); the route checks
// that it belongs to the tab.
export async function listEmails(
  userId: string,
  tab: EmailTab,
  pagination: Pagination,
  status?: EmailStatus,
): Promise<Page<EmailListItem>> {
  const where: Prisma.EmailWhereInput = { userId, status: status ?? { in: TAB_STATUSES[tab] } };
  const [rows, total] = await prisma.$transaction([
    prisma.email.findMany({ where, orderBy: TAB_ORDER[tab], select: emailListSelect, ...toSkipTake(pagination) }),
    prisma.email.count({ where }),
  ]);
  const items = rows.map(({ body, ...row }) => ({ ...row, preview: bodyPreview(body) }));
  return buildPage(items, total, pagination);
}

// Everything the email detail page shows. Scoped by userId, so another user's id is a 404.
export async function getEmailDetail(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    select: {
      ...emailListSelect,
      attempts: true,
      campaign: { select: { hourlyLimit: true, delayBetweenMs: true, sender: { select: { name: true, smtpUser: true } } } },
    },
  });
  if (!email) throw new HttpError(404, 'Email not found');
  const { campaign, ...rest } = email;
  return {
    ...rest,
    sender: { name: campaign.sender.name, email: campaign.sender.smtpUser },
    hourlyLimit: campaign.hourlyLimit,
    delayBetweenMs: campaign.delayBetweenMs,
  };
}

export interface EmailStats {
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
}

export async function getEmailStats(userId: string): Promise<EmailStats> {
  const grouped = await prisma.email.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } });
  const count = (status: EmailStatus) => grouped.find((row) => row.status === status)?._count._all ?? 0;
  const stats = {
    scheduled: count(EmailStatus.SCHEDULED),
    processing: count(EmailStatus.PROCESSING),
    sent: count(EmailStatus.SENT),
    failed: count(EmailStatus.FAILED),
  };
  return { ...stats, total: stats.scheduled + stats.processing + stats.sent + stats.failed };
}
