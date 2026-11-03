import type { SlackConnection } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { EXTERNAL_CALL_TIMEOUT_MS, SLACK_CONNECT_ATTEMPTS } from '../config/constants.js';
import { logger, prisma } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_API_URL = 'https://slack.com/api';
// incoming-webhook: Slack shows a channel picker during install and gives us a webhook for it.
// chat:write: lets the bot post with its token, used as a fallback when the webhook fails.
const SLACK_SCOPES = ['incoming-webhook', 'chat:write'];

// A Slack message: `text` is the plain fallback used in push notifications, `blocks` the rich layout.
export interface SlackMessage {
  text: string;
  blocks: object[];
}

export type SlackStatus =
  | { connected: false }
  | { connected: true; teamName: string; channelName: string | null; connectedAt: Date };

function getSlackConfig() {
  const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI } = env;
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_REDIRECT_URI) {
    throw new HttpError(503, 'Slack is not configured on this server');
  }
  return { clientId: SLACK_CLIENT_ID, clientSecret: SLACK_CLIENT_SECRET, redirectUri: SLACK_REDIRECT_URI };
}

export function buildSlackAuthUrl(state: string): string {
  const { clientId, redirectUri } = getSlackConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params}`;
}

// Slack didn't answer at all (DNS failure, connection refused, timeout), as opposed to Slack
// answering with an error. Callers use it to show "try again" instead of "something is wrong".
export class SlackUnreachableError extends Error {
  constructor(what: string, cause: unknown) {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Could not reach Slack (${what}): ${reason}`);
    this.name = 'SlackUnreachableError';
  }
}

// fetch() with a timeout and one retry when Slack can't be reached. Only failures BEFORE a response
// are retried; an answer from Slack (even an error) is returned as is. fetch's own errors (a
// DOMException for timeouts, a TypeError for network failures) become one readable error.
async function fetchSlack(url: string, init: RequestInit, what: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SLACK_CONNECT_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS) });
    } catch (err) {
      lastError = err;
      logger.warn({ what, attempt, reason: err instanceof Error ? err.message : String(err) }, 'Slack unreachable');
    }
  }
  throw new SlackUnreachableError(what, lastError);
}

// Calls a Slack Web API method. Slack answers HTTP 200 even for errors and reports them as
// { ok: false, error: "..." }, so `ok` must be checked explicitly.
async function callSlackApi(
  method: string,
  { form, json, token }: { form?: Record<string, string>; json?: object; token?: string },
): Promise<unknown> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  let body: string | URLSearchParams | undefined;
  if (form) body = new URLSearchParams(form);
  if (json) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    body = JSON.stringify(json);
  }

  const res = await fetchSlack(`${SLACK_API_URL}/${method}`, { method: 'POST', headers, body }, method);
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error ?? `HTTP ${res.status}`}`);
  return data;
}

// Only the fields we store; zod also guards against Slack changing the response shape.
const oauthAccessSchema = z.object({
  access_token: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
  incoming_webhook: z
    .object({ channel: z.string(), channel_id: z.string(), url: z.url() })
    .optional(),
});

// Exchanges the one-time code for the bot token + webhook and saves them for this user.
// Upsert: connecting again (e.g. to pick another channel) overwrites the old connection.
export async function completeSlackOAuth(userId: string, code: string): Promise<SlackConnection> {
  const { clientId, clientSecret, redirectUri } = getSlackConfig();
  const response = await callSlackApi('oauth.v2.access', {
    form: { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
  });
  const { access_token, team, incoming_webhook } = oauthAccessSchema.parse(response);

  const data = {
    teamId: team.id,
    teamName: team.name,
    accessToken: access_token,
    // Explicit nulls so a reconnect without a webhook doesn't keep the old channel's webhook.
    channelId: incoming_webhook?.channel_id ?? null,
    channelName: incoming_webhook?.channel ?? null,
    webhookUrl: incoming_webhook?.url ?? null,
  };
  return prisma.slackConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function findSlackConnection(userId: string): Promise<SlackConnection | null> {
  return prisma.slackConnection.findUnique({ where: { userId } });
}

// Never exposes the token or webhook URL: both let anyone post into the user's Slack.
export async function getSlackStatus(userId: string): Promise<SlackStatus> {
  const connection = await findSlackConnection(userId);
  if (!connection) return { connected: false };
  return {
    connected: true,
    teamName: connection.teamName,
    channelName: connection.channelName,
    connectedAt: connection.updatedAt,
  };
}

// Deletes our copy of the credentials; nothing is sent to this user's Slack after that.
// Deliberately NOT calling auth.revoke: a bot token belongs to the app's install in the whole
// workspace and is shared by every user who connected that workspace, so revoking it uninstalls
// the app and silently breaks everyone else's alerts. Removing the app entirely is done in Slack.
export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}

async function postToWebhook(webhookUrl: string, message: SlackMessage): Promise<void> {
  const res = await fetchSlack(
    webhookUrl,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) },
    'incoming webhook',
  );
  // Webhooks reply with plain text: "ok" on success, an error code such as "channel_not_found" otherwise.
  if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status} ${await res.text()}`);
}

// Webhook first (it always targets the channel picked at install). If it fails, e.g. the
// webhook was removed in Slack, fall back to chat.postMessage with the bot token.
export async function postToSlack(connection: SlackConnection, message: SlackMessage): Promise<void> {
  if (connection.webhookUrl) {
    try {
      await postToWebhook(connection.webhookUrl, message);
      return;
    } catch (err) {
      if (!connection.channelId) throw err;
      logger.warn({ err, userId: connection.userId }, 'Slack webhook failed; trying chat.postMessage');
    }
  }
  if (!connection.channelId) throw new Error('Slack connection has no webhook or channel to post to');
  await callSlackApi('chat.postMessage', {
    token: connection.accessToken,
    json: { channel: connection.channelId, ...message },
  });
}
