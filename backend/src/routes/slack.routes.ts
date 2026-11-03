import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { signStateToken, verifyStateToken } from '../lib/tokens.js';
import { getAuthUserId, requireAuth } from '../middleware/require-auth.js';
import { buildTestMessage } from '../services/slack-notifier.service.js';
import {
  buildSlackAuthUrl,
  completeSlackOAuth,
  disconnectSlack,
  findSlackConnection,
  getSlackStatus,
  postToSlack,
  SlackUnreachableError,
} from '../services/slack.service.js';

// requireAuth is applied per route, not to the whole router: /callback must stay public because
// Slack redirects the browser there on the ngrok domain, where the localhost session cookie isn't sent.
export const slackRouter = Router();

// Step 1: the dashboard navigates the browser here, and we send it on to Slack's consent screen.
// The signed, 10-minute `state` carries the userId, so the callback knows who is connecting
// without a cookie; the signature means it can't be forged or pointed at another user.
slackRouter.get('/connect', requireAuth, (req, res) => {
  const state = signStateToken('slack-oauth-state', { userId: getAuthUserId(req) });
  res.redirect(buildSlackAuthUrl(state));
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

// Step 2: Slack redirects back here. A browser navigation, so the result is a redirect to the dashboard.
slackRouter.get('/callback', async (req, res) => {
  const finish = (result: 'connected' | 'error', reason?: string) => {
    const params = new URLSearchParams({ slack: result, ...(reason ? { reason } : {}) });
    res.redirect(`${env.FRONTEND_URL}/dashboard?${params}`);
  };

  const query = callbackQuerySchema.safeParse(req.query);
  if (!query.success) return finish('error', 'invalid_request');
  const { code, state, error } = query.data;
  if (error) return finish('error', 'access_denied'); // user clicked "Cancel" in Slack

  const userId = state ? verifyStateToken(state, 'slack-oauth-state')?.userId : undefined;
  if (typeof userId !== 'string') return finish('error', 'invalid_state');
  if (!code) return finish('error', 'missing_code');

  try {
    const connection = await completeSlackOAuth(userId, code);
    logger.info({ userId, team: connection.teamName, channel: connection.channelName }, 'Slack connected');
    finish('connected');
  } catch (err) {
    logger.error({ err, userId }, 'Slack OAuth callback failed');
    // A network blip deserves "try again"; anything else (e.g. an expired code) is a real failure.
    finish('error', err instanceof SlackUnreachableError ? 'slack_unreachable' : 'oauth_failed');
  }
});

slackRouter.get('/status', requireAuth, async (req, res) => {
  res.json(await getSlackStatus(getAuthUserId(req)));
});

// Idempotent: 204 whether or not a connection existed.
slackRouter.delete('/', requireAuth, async (req, res) => {
  await disconnectSlack(getAuthUserId(req));
  logger.info({ userId: req.userId }, 'Slack disconnected');
  res.status(204).end();
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const connection = await findSlackConnection(getAuthUserId(req));
  if (!connection) throw new HttpError(409, 'Slack is not connected');
  try {
    await postToSlack(connection, buildTestMessage());
  } catch (err) {
    logger.warn({ err, userId: req.userId }, 'Slack test message failed');
    if (err instanceof SlackUnreachableError) throw new HttpError(502, 'Could not reach Slack, please try again');
    throw new HttpError(502, 'Slack rejected the message; try reconnecting Slack');
  }
  res.json({ sent: true });
});
