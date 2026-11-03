import nodemailer from 'nodemailer';
import type { Sender } from '@prisma/client';
import { env } from '../config/env.js';
import { SMTP_POOL_MAX_CONNECTIONS, SMTP_TIMEOUT_MS } from '../config/constants.js';

function createSenderTransport(sender: Sender) {
  return nodemailer.createTransport({
    // Pooled: reuse open SMTP connections instead of a new TCP + TLS + AUTH handshake per email.
    pool: true,
    maxConnections: SMTP_POOL_MAX_CONNECTIONS,
    host: sender.smtpHost,
    port: sender.smtpPort,
    // Port 465 is implicit TLS; others (Ethereal uses 587) upgrade with STARTTLS.
    secure: sender.smtpPort === 465,
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

type SenderTransport = ReturnType<typeof createSenderTransport>;

// One transport per sender per worker process, created on first use.
const transports = new Map<string, SenderTransport>();

function getTransport(sender: Sender): SenderTransport {
  let transport = transports.get(sender.id);
  if (!transport) {
    transport = createSenderTransport(sender);
    transports.set(sender.id, transport);
  }
  return transport;
}

const messageIdDomain = new URL(env.API_PUBLIC_URL).hostname;

export interface OutgoingEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
}

export interface SentEmailInfo {
  messageId: string;
  // Link to view the captured message on ethereal.email (null for non-Ethereal SMTP).
  previewUrl: string | null;
}

export async function sendEmail(sender: Sender, email: OutgoingEmail): Promise<SentEmailInfo> {
  // Deterministic Message-ID derived from our row id: if the same email is ever submitted twice
  // (e.g. a crash right after the SMTP call), a provider can recognise it as a duplicate.
  const messageId = `<${email.id}@${messageIdDomain}>`;
  const info = await getTransport(sender).sendMail({
    from: { name: sender.name, address: sender.smtpUser },
    to: email.to,
    subject: email.subject,
    text: email.body,
    messageId,
  });
  return {
    messageId: info.messageId ?? messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  };
}

// Closes pooled SMTP connections on shutdown.
export function closeTransports(): void {
  for (const transport of transports.values()) transport.close();
  transports.clear();
}
