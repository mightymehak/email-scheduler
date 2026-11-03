import { Router } from 'express';
import { QUICK_CHECK_TIMEOUT_MS } from '../config/constants.js';
import { elastic, prisma, redis } from '../lib/clients.js';
import { withTimeout } from '../lib/timeout.js';

export const healthRouter = Router();

// Reports "ok" / "down" instead of throwing, so one failing dependency doesn't hide the others.
// The timeout matters: our Redis clients use maxRetriesPerRequest:null, so a ping would
// otherwise wait forever while Redis is down.
async function check(fn: () => Promise<unknown>): Promise<'ok' | 'down'> {
  try {
    await withTimeout(fn(), QUICK_CHECK_TIMEOUT_MS, 'health check');
    return 'ok';
  } catch {
    return 'down';
  }
}

healthRouter.get('/health', async (_req, res) => {
  const [postgres, redisStatus, elasticsearch] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
    check(() => elastic.ping()),
  ]);
  const deps = { postgres, redis: redisStatus, elasticsearch };
  const healthy = Object.values(deps).every((status) => status === 'ok');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', deps });
});
