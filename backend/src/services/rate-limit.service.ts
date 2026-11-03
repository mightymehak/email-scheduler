import { EmailStatus, type Email, type Prisma } from '@prisma/client';
import type { Redis, Result } from 'ioredis';
import { env } from '../config/env.js';
import { RATE_COUNTER_TTL_MS, SMTP_TIMEOUT_MS } from '../config/constants.js';
import { logger, prisma, redis } from '../lib/clients.js';
import { campaignHourKey, hourWindow, senderGapKey, senderHourKey, windowStartMs } from '../lib/rate-limit-keys.js';

// The gap key has two phases, told apart by its value:
//   "sending"  - a lease held while one send is in flight (TTL long enough to cover a slow SMTP call)
//   "cooldown" - set when that send finishes, lives for exactly MIN_DELAY_BETWEEN_SENDS_MS
// So the minimum delay is measured from when the previous send FINISHED, which is what the
// sentAt timestamps in the dashboard show.
const LEASE = 'sending';
const COOLDOWN = 'cooldown';

// Everything a send needs, checked and reserved in ONE atomic step. Redis runs a Lua script
// without interleaving any other command, so two workers can never both read "199 sent", both
// decide they're allowed, and push the counter to 201.
//
// KEYS: 1 gap key, 2 sender hour counter, 3 campaign hour counter
// ARGV: 1 sender limit, 2 campaign limit, 3 lease ms (0 = no gap), 4 gap ms, 5 counter TTL ms
// Returns {code, value}:
//   {0, senderCountAfter}  allowed: counters incremented, gap lease taken
//   {1, retryInMs}         another send of this sender is in flight or cooling down
//   {2, senderCount}       sender hourly limit reached
//   {3, campaignCount}     campaign hourly limit reached
const ACQUIRE_SEND_SLOT_LUA = `
local gapValue = redis.call('GET', KEYS[1])
if gapValue then
  local ttl = redis.call('PTTL', KEYS[1])
  if gapValue == '${COOLDOWN}' and ttl > 0 then
    return {1, ttl}
  end
  return {1, tonumber(ARGV[4])}
end

local senderCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if senderCount >= tonumber(ARGV[1]) then
  return {2, senderCount}
end

local campaignCount = tonumber(redis.call('GET', KEYS[3]) or '0')
if campaignCount >= tonumber(ARGV[2]) then
  return {3, campaignCount}
end

local newSenderCount = redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], ARGV[5])
redis.call('INCR', KEYS[3])
redis.call('PEXPIRE', KEYS[3], ARGV[5])
if tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[1], '${LEASE}', 'PX', ARGV[3])
end
return {0, newSenderCount}
`;

// Teach TypeScript about the custom command that defineCommand() adds to ioredis clients.
declare module 'ioredis' {
  interface RedisCommander<Context> {
    acquireSendSlot(
      gapKey: string,
      senderHourKey: string,
      campaignHourKey: string,
      senderLimit: number,
      campaignLimit: number,
      leaseMs: number,
      gapMs: number,
      counterTtlMs: number,
    ): Result<[number, number], Context>;
  }
}

// defineCommand loads the script once and then calls it by SHA (EVALSHA), re-sending the body
// automatically if Redis has forgotten it (e.g. after a restart).
export function registerRateLimitScript(client: Redis): void {
  client.defineCommand('acquireSendSlot', { numberOfKeys: 3, lua: ACQUIRE_SEND_SLOT_LUA });
}
registerRateLimitScript(redis);

export interface SlotRequest {
  senderId: string;
  campaignId: string;
  senderLimit: number;
  campaignLimit: number;
  // Min delay between sends of this sender; 0 disables the gap check.
  gapMs: number;
}

export type SlotResult =
  | { code: 'OK'; senderCount: number }
  | { code: 'GAP'; retryInMs: number }
  | { code: 'SENDER_LIMIT' | 'CAMPAIGN_LIMIT'; count: number };

export async function acquireSendSlot(req: SlotRequest, client: Redis = redis): Promise<SlotResult> {
  const window = hourWindow();
  const leaseMs = req.gapMs > 0 ? req.gapMs + SMTP_TIMEOUT_MS : 0;
  const [code, value] = await client.acquireSendSlot(
    senderGapKey(req.senderId),
    senderHourKey(req.senderId, window),
    campaignHourKey(req.campaignId, window),
    req.senderLimit,
    req.campaignLimit,
    leaseMs,
    req.gapMs,
    RATE_COUNTER_TTL_MS,
  );
  switch (code) {
    case 0:
      return { code: 'OK', senderCount: value };
    case 1:
      return { code: 'GAP', retryInMs: value };
    case 2:
      return { code: 'SENDER_LIMIT', count: value };
    case 3:
      return { code: 'CAMPAIGN_LIMIT', count: value };
    default:
      throw new Error(`Unexpected rate-limit script result: ${code}`);
  }
}

// Called once the SMTP call has finished (successfully or not). Never throws: this runs right
// after a successful send, and an exception here would leave the row PROCESSING and risk a resend.
// If it fails, the lease still expires on its own.
export async function startSendCooldown(senderId: string): Promise<void> {
  const gapMs = env.MIN_DELAY_BETWEEN_SENDS_MS;
  if (gapMs === 0) return;
  try {
    await redis.set(senderGapKey(senderId), COOLDOWN, 'PX', gapMs);
  } catch (err) {
    logger.warn({ err, senderId }, 'Could not start send cooldown; lease will expire on its own');
  }
}

// The set of emails sharing the limit that was hit.
export type LimitScope =
  | { kind: 'sender'; senderId: string; limit: number }
  | { kind: 'campaign'; campaignId: string; limit: number };

type QueuePosition = Pick<Email, 'id' | 'originalScheduledAt' | 'sequence'>;

// Position n of this email in its scope's backlog = how many still-unsent emails of the same
// scope come BEFORE it in original order (originalScheduledAt, then sequence, then id).
// Using the original order (not the order emails happen to reach the limit) is what keeps the
// schedule ordered under load: when 1000 emails are due at once they reach the limit check in
// a near-random order, because each one bounces off the min-gap check a few times first.
async function countUnsentAhead(email: QueuePosition, scope: LimitScope): Promise<number> {
  const time = email.originalScheduledAt;
  const where: Prisma.EmailWhereInput = {
    ...(scope.kind === 'sender' ? { senderId: scope.senderId } : { campaignId: scope.campaignId }),
    status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING] },
    OR: [
      { originalScheduledAt: { lt: time } },
      { originalScheduledAt: time, sequence: { lt: email.sequence } },
      { originalScheduledAt: time, sequence: email.sequence, id: { lt: email.id } },
    ],
  };
  return prisma.email.count({ where });
}

// Send time for an email that hit an hourly limit. Positions are laid out `limit` per hour
// window, starting at the next window, one gap apart:
//   n = 0..limit-1        -> next window, at +0, +gap, +2*gap, ...
//   n = limit..2*limit-1  -> the window after, and so on.
// If two emails ever end up with the same slot, the Lua script still lets only the allowed
// number through and the other is simply deferred again with a fresh position.
export async function computeDeferredSendTime(email: QueuePosition, scope: LimitScope, gapMs: number): Promise<Date> {
  const position = await countUnsentAhead(email, scope);
  const nextWindow = hourWindow() + 1;
  const window = nextWindow + Math.floor(position / scope.limit);
  // At least 1ms apart so slots keep their order even with no min gap configured.
  const spacingMs = Math.max(gapMs, 1);
  return new Date(windowStartMs(window) + (position % scope.limit) * spacingMs);
}
