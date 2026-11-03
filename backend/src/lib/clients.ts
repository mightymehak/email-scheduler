import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import { pino } from 'pino';
import { env, isProduction } from '../config/env.js';

// JSON logs in production (for log shippers), human-readable logs in development.
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProduction ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});

// One PrismaClient per process; it manages its own connection pool.
export const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
  ],
});

// Every connection made by createRedis(), so closeClients() can quit them all on shutdown
// (BullMQ doesn't close connections that were passed in to it).
const redisClients = new Set<Redis>();

// Factory instead of a single shared client: BullMQ workers use blocking Redis commands,
// so the queue, the worker and general app commands should each get their own connection.
//
// Default ("wait") mode is required for BullMQ workers: with a retry limit, commands would throw
// while Redis is down and crash the worker; `maxRetriesPerRequest: null` makes them wait until
// ioredis reconnects.
// `failFast` is for request paths (the API's producer queue): while Redis is down, commands are
// rejected immediately instead of queueing forever, so an HTTP request can't hang.
export function createRedis(name: string, { failFast = false } = {}): Redis {
  const client = new Redis(env.REDIS_URL, {
    connectionName: name,
    ...(failFast
      ? { enableOfflineQueue: false, maxRetriesPerRequest: 1 }
      : { maxRetriesPerRequest: null }),
  });
  // Without an 'error' listener, a connection error would be an unhandled event and kill the process.
  client.on('error', (err) => logger.error({ err, redis: name }, 'Redis connection error'));
  redisClients.add(client);
  return client;
}

// Shared connection for plain commands (rate-limit counters, Slack dedupe keys, ...).
export const redis = createRedis('app');

export const elastic = new ElasticClient({ node: env.ELASTICSEARCH_URL });

// Called on SIGINT/SIGTERM after the HTTP server / worker has stopped taking new work.
export async function closeClients(): Promise<void> {
  await Promise.allSettled([
    prisma.$disconnect(),
    elastic.close(),
    ...[...redisClients].map((client) => client.quit()),
  ]);
}
