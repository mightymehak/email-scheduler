// Load test: logs in via dev-login and schedules N emails all due at the same moment, to show
// how the system behaves when 1000+ emails compete for one sender's limits.
//
//   npm run load-test                                   # 1000 emails, due now
//   npm run load-test -- --count 5000 --start-in 60     # 5000 emails, due in 60s
//   npm run load-test -- --hourly-limit 50 --sender <id>
//
// Requires the API running with ALLOW_DEV_LOGIN=true. Recipients use the reserved .test TLD.
import { parseArgs } from 'node:util';
import { env } from '../src/config/env.js';

const { values: args } = parseArgs({
  options: {
    api: { type: 'string', default: env.API_PUBLIC_URL },
    email: { type: 'string', default: 'loadtest@example.com' },
    count: { type: 'string', default: '1000' },
    'start-in': { type: 'string', default: '0' }, // seconds from now
    delay: { type: 'string', default: '0' }, // delayBetweenMs; 0 = all due at the same time
    'hourly-limit': { type: 'string', default: '1000' },
    sender: { type: 'string' },
  },
});

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${args.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main(): Promise<void> {
  const count = Number(args.count);
  const { token } = await postJson<{ token: string }>('/auth/dev-login', { email: args.email, name: 'Load test' });

  const emails = Array.from({ length: count }, (_, i) => `lead${String(i).padStart(5, '0')}@loadtest.test`);
  const startedAt = Date.now();
  const result = await postJson<{
    scheduledCount: number;
    enqueued: boolean;
    firstSendAt: string;
    lastSendAt: string;
    campaign: { id: string };
    sender: { id: string; email: string };
  }>(
    '/api/campaigns/schedule',
    {
      subject: `Load test ${new Date().toISOString()}`,
      body: 'This is a load-test email.',
      emails,
      startTime: Date.now() + Number(args['start-in']) * 1000,
      delayBetweenMs: Number(args.delay),
      hourlyLimit: Number(args['hourly-limit']),
      ...(args.sender ? { senderId: args.sender } : {}),
    },
    token,
  );

  console.log({
    scheduled: result.scheduledCount,
    enqueued: result.enqueued,
    requestMs: Date.now() - startedAt,
    campaignId: result.campaign.id,
    sender: result.sender.email,
    firstSendAt: result.firstSendAt,
    lastSendAt: result.lastSendAt,
  });
  console.log('Watch progress: GET /api/emails/stats, GET /api/senders, or Bull Board at /admin/queues.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
