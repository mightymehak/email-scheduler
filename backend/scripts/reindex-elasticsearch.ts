// Rebuilds the Elasticsearch index from Postgres (the source of truth).
// Use it after Elasticsearch was down while emails were scheduled/sent, or after a mapping change.
//
//   npm run es:reindex               index every email (existing documents are overwritten)
//   npm run es:reindex -- --recreate delete the index first and create it with the current mapping
import { parseArgs } from 'node:util';
import { env } from '../src/config/env.js';
import { SEARCH_BULK_CHUNK_SIZE } from '../src/config/constants.js';
import { closeClients, elastic, logger } from '../src/lib/clients.js';
import { bulkIndexRows, ensureSearchIndex, findRowsForReindex } from '../src/services/search.service.js';

const { values } = parseArgs({ options: { recreate: { type: 'boolean', default: false } } });
const index = env.ELASTICSEARCH_INDEX;

try {
  if (values.recreate) {
    await elastic.indices.delete({ index }, { ignore: [404] });
    logger.info({ index }, 'Index deleted');
  }
  await ensureSearchIndex();

  let lastId: string | undefined;
  let indexed = 0;
  let failed = 0;
  for (;;) {
    const rows = await findRowsForReindex(lastId, SEARCH_BULK_CHUNK_SIZE);
    if (rows.length === 0) break;
    const result = await bulkIndexRows(rows);
    indexed += result.indexed;
    failed += result.failed;
    lastId = rows[rows.length - 1]!.id;
    logger.info({ indexed, failed }, 'Reindex progress');
  }

  // Make the documents searchable right away instead of after the next ~1s refresh.
  await elastic.indices.refresh({ index });
  const { count } = await elastic.count({ index });
  logger.info({ index, indexed, failed, documentsInIndex: count }, 'Reindex finished');
  process.exitCode = failed > 0 ? 1 : 0;
} catch (err) {
  logger.error({ err }, 'Reindex failed');
  process.exitCode = 1;
} finally {
  await closeClients();
}
