import nodemailer from 'nodemailer';
import type { Sender } from '@prisma/client';
import { env } from '../config/env.js';
import {
  ETHEREAL_SMTP_HOST,
  ETHEREAL_SMTP_PORT,
  EXTERNAL_CALL_TIMEOUT_MS,
  QUICK_CHECK_TIMEOUT_MS,
  SMTP_TIMEOUT_MS,
} from '../config/constants.js';
import { logger, prisma, redis } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { HOUR_MS, hourWindow, senderHourKey } from '../lib/rate-limit-keys.js';
import { withTimeout } from '../lib/timeout.js';

// Shape returned to the frontend. The SMTP password never leaves the backend.
export interface PublicSender {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  createdAt: Date;
}

export interface SenderWithUsage extends PublicSender {
  usage: {
    // null when Redis couldn't be read; the dashboard shows "unknown" instead of failing.
    sentThisHour: number | null;
    hourlyLimit: number;
    windowResetsAt: Date;
  };
}

export function toPublicSender(sender: Sender): PublicSender {
  return {
    id: sender.id,
    name: sender.name,
    email: sender.smtpUser,
    smtpHost: sender.smtpHost,
    smtpPort: sender.smtpPort,
    createdAt: sender.createdAt,
  };
}

// Asks Ethereal for a fresh throwaway SMTP account and stores it as a sender for this user.
// nodemailer.createTestAccount() caches the first account for the whole process unless
// ETHEREAL_CACHE is off, so every "new" sender would silently get the SAME Ethereal mailbox.
// Set in code (not .env) because correctness must not depend on a deployment setting.
process.env.ETHEREAL_CACHE = 'no';

// Adds an Ethereal account the user created themselves on ethereal.email, so they can log in
// there and watch its mailbox. The SMTP login is tested BEFORE saving, so a typo in the
// password is reported now instead of every email failing later.
export async function addExistingEtherealSender(
  userId: string,
  name: string,
  email: string,
  password: string,
): Promise<Sender> {
  const smtpUser = email.toLowerCase();
  if (await prisma.sender.findFirst({ where: { userId, smtpUser } })) {
    throw new HttpError(409, 'You already have a sender for this Ethereal account');
  }

  const transport = nodemailer.createTransport({
    host: ETHEREAL_SMTP_HOST,
    port: ETHEREAL_SMTP_PORT,
    auth: { user: smtpUser, pass: password },
    connectionTimeout: SMTP_TIMEOUT_MS,
  });
  try {
    // verify() connects and logs in without sending anything.
    await withTimeout(transport.verify(), EXTERNAL_CALL_TIMEOUT_MS, 'Ethereal SMTP login');
  } catch (err) {
    // EAUTH = the server answered and refused the login; anything else = we couldn't reach it.
    if ((err as { code?: string }).code === 'EAUTH') {
      throw new HttpError(400, 'Ethereal rejected this address and password');
    }
    logger.warn({ err, userId }, 'Could not verify Ethereal account');
    throw new HttpError(502, 'Could not reach Ethereal to check the account, please retry');
  } finally {
    transport.close();
  }

  return prisma.sender.create({
    data: { userId, name, smtpHost: ETHEREAL_SMTP_HOST, smtpPort: ETHEREAL_SMTP_PORT, smtpUser, smtpPass: password },
  });
}

export async function createEtherealSender(userId: string, name: string): Promise<Sender> {
  const account = await withTimeout(
    nodemailer.createTestAccount(),
    EXTERNAL_CALL_TIMEOUT_MS,
    'Ethereal createTestAccount',
  );
  return prisma.sender.create({
    data: {
      userId,
      name,
      smtpHost: account.smtp.host,
      smtpPort: account.smtp.port,
      smtpUser: account.user,
      smtpPass: account.pass,
    },
  });
}

// Gives a brand-new user one sender so they can schedule straight away.
// Never throws: if Ethereal is down, login still succeeds and a sender can be added later
// via POST /api/senders. (Two simultaneous first logins could create two senders, which is harmless.)
export async function ensureDefaultSender(userId: string): Promise<void> {
  const existing = await prisma.sender.count({ where: { userId } });
  if (existing > 0) return;
  try {
    const sender = await createEtherealSender(userId, 'Default sender');
    logger.info({ userId, senderId: sender.id, smtpUser: sender.smtpUser }, 'Created default Ethereal sender');
  } catch (err) {
    logger.warn({ err, userId }, 'Could not create default Ethereal sender; continuing login');
  }
}

// Picks the sender for a new campaign: the requested one (must belong to the user),
// otherwise the user's oldest sender, creating one first if they have none.
// The senders a campaign will use, in the order given. Every id must belong to this user; with no
// ids, the user's oldest sender is used (created on the fly if they have none yet).
export async function resolveSendersForUser(userId: string, senderIds?: string[]): Promise<Sender[]> {
  if (!senderIds || senderIds.length === 0) return [await resolveSenderForUser(userId)];
  const found = await prisma.sender.findMany({ where: { id: { in: senderIds }, userId } });
  const byId = new Map(found.map((sender) => [sender.id, sender]));
  return senderIds.map((id) => {
    const sender = byId.get(id);
    if (!sender) throw new HttpError(404, 'Sender not found');
    return sender;
  });
}

export async function resolveSenderForUser(userId: string, senderId?: string): Promise<Sender> {
  if (senderId) {
    const sender = await prisma.sender.findFirst({ where: { id: senderId, userId } });
    if (!sender) throw new HttpError(404, 'Sender not found');
    return sender;
  }

  const findOldest = () => prisma.sender.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  let sender = await findOldest();
  if (!sender) {
    await ensureDefaultSender(userId);
    sender = await findOldest();
  }
  if (!sender) throw new HttpError(409, 'No sender available. Create one with POST /api/senders.');
  return sender;
}

// Lists the user's senders with how many emails each has sent in the current hour window.
// The counters are the same Redis keys the worker increments, so this is the live usage.
export async function listSendersWithUsage(userId: string): Promise<SenderWithUsage[]> {
  const senders = await prisma.sender.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (senders.length === 0) return [];

  const window = hourWindow();
  const keys = senders.map((sender) => senderHourKey(sender.id, window));
  const counts = await withTimeout(redis.mget(...keys), QUICK_CHECK_TIMEOUT_MS, 'sender usage').catch(
    (err: unknown) => {
      logger.warn({ err }, 'Could not read sender usage from Redis');
      return null;
    },
  );

  return senders.map((sender, i) => ({
    ...toPublicSender(sender),
    usage: {
      sentThisHour: counts ? Number(counts[i] ?? 0) : null,
      hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      windowResetsAt: new Date((window + 1) * HOUR_MS),
    },
  }));
}
