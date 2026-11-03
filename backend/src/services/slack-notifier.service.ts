import type { Sender } from '@prisma/client';
import { RATE_COUNTER_TTL_MS, SLACK_ALERT_RETRY_MS } from '../config/constants.js';
import { logger, redis } from '../lib/clients.js';
import { hourWindow, slackAlertKey, windowStartMs } from '../lib/rate-limit-keys.js';
import { findSlackConnection, postToSlack, type SlackMessage } from './slack.service.js';

export interface RateLimitHit {
  userId: string;
  limitKind: 'sender' | 'campaign';
  limit: number;
  sender: Pick<Sender, 'id' | 'name' | 'smtpUser'>;
  campaign: { id: string; subject: string };
}

// User text inside Slack mrkdwn must have &, < and > escaped, or "<...>" would be read as a link/mention.
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Slack renders <!date^...> in each reader's own timezone; the text after "|" is the fallback.
function slackDate(date: Date): string {
  const unix = Math.floor(date.getTime() / 1000);
  return `<!date^${unix}^{date_short_pretty} at {time}|${date.toISOString()}>`;
}

function buildRateLimitMessage(hit: RateLimitHit, resumeAt: Date): SlackMessage {
  const scopeLabel = hit.limitKind === 'sender' ? 'per sender' : 'per campaign';
  const sender = `${escapeMrkdwn(hit.sender.name)} (${escapeMrkdwn(hit.sender.smtpUser)})`;
  return {
    text: `Hourly limit reached for ${hit.sender.smtpUser}: ${hit.limit} emails/hour. Sending resumes at ${resumeAt.toISOString()}.`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '⏸️ Hourly sending limit reached' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Sender*\n${sender}` },
          { type: 'mrkdwn', text: `*Limit*\n${hit.limit} emails/hour (${scopeLabel})` },
          { type: 'mrkdwn', text: `*Campaign*\n${escapeMrkdwn(hit.campaign.subject)}` },
          { type: 'mrkdwn', text: `*Sending resumes*\n${slackDate(resumeAt)}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Remaining emails were rescheduled to the next hour, not dropped. You get at most one alert per limit per hour.' },
        ],
      },
    ],
  };
}

// Called by the worker every time an email is deferred because a limit was hit. Sends at most
// one Slack alert per sender (or campaign) per hour window, across all workers.
// Never throws: a Slack problem must not affect the email job.
export async function notifyRateLimitHit(hit: RateLimitHit): Promise<void> {
  const scopeId = hit.limitKind === 'sender' ? hit.sender.id : hit.campaign.id;
  const window = hourWindow();
  const key = slackAlertKey(hit.limitKind, scopeId, window);
  const log = logger.child({ userId: hit.userId, limitKind: hit.limitKind, scopeId });

  try {
    // Cheap exit for the common case: with 1000 emails over the limit, all but the first land here.
    if (await redis.exists(key)) return;

    // Looked up now, not cached at startup: connecting or disconnecting Slack takes effect
    // on the next limit hit without restarting the worker.
    const connection = await findSlackConnection(hit.userId);
    if (!connection) return;

    // SET NX is atomic: if several workers race past the EXISTS check, only one gets 'OK' and sends.
    const claimed = await redis.set(key, 'sent', 'PX', RATE_COUNTER_TTL_MS, 'NX');
    if (claimed !== 'OK') return;

    try {
      await postToSlack(connection, buildRateLimitMessage(hit, new Date(windowStartMs(window + 1))));
      log.info('Slack rate-limit alert sent');
    } catch (err) {
      // Let a later limit hit retry in a minute instead of losing this hour's alert.
      await redis.set(key, 'failed', 'PX', SLACK_ALERT_RETRY_MS);
      throw err;
    }
  } catch (err) {
    log.warn({ err }, 'Slack rate-limit alert failed');
  }
}

// For POST /api/slack/test: lets the user check the connection without hitting a real limit.
export function buildTestMessage(): SlackMessage {
  return {
    text: 'Email Scheduler is connected. Rate-limit alerts will appear in this channel.',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ *Email Scheduler is connected.*\nHourly rate-limit alerts will appear in this channel.' },
      },
    ],
  };
}
