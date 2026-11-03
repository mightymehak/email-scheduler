import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeClients, logger } from './lib/clients.js';
import { emailQueue } from './queues/email.queue.js';
import { ensureSearchIndex } from './services/search.service.js';

// Best effort: the API still starts without Elasticsearch (search answers 503 until it's back).
// If the index is missing then, run npm run es:reindex once Elasticsearch is up.
try {
  await ensureSearchIndex();
} catch (err) {
  logger.error({ err }, 'Could not prepare the Elasticsearch index; search is unavailable');
}

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on ${env.API_PUBLIC_URL} (port ${env.PORT})`);
  logger.info(`Bull Board: ${env.API_PUBLIC_URL}/admin/queues`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down API');
  // Stop accepting new connections, let in-flight requests finish, then close clients.
  server.close(async () => {
    await emailQueue.close();
    await closeClients();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
