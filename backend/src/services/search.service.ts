import type { EmailStatus, Prisma } from '@prisma/client';
import { errors as esErrors } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import { EXTERNAL_CALL_TIMEOUT_MS, SEARCH_BULK_CHUNK_SIZE } from '../config/constants.js';
import { elastic, logger, prisma } from '../lib/clients.js';
import { HttpError } from '../lib/http-error.js';
import { buildPage, toSkipTake, type Page, type Pagination } from '../lib/pagination.js';
import { bodyPreview, TAB_STATUSES, type EmailTab } from './email.service.js';

const index = env.ELASTICSEARCH_INDEX;

// Postgres is the source of truth; the index is a searchable copy that can always be rebuilt
// from it (npm run es:reindex). That's why every write below is best effort.
const searchRowSelect = {
  id: true,
  userId: true,
  campaignId: true,
  toEmail: true,
  subject: true,
  body: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  updatedAt: true,
  previewUrl: true,
  error: true,
} satisfies Prisma.EmailSelect;

export type SearchRow = Prisma.EmailGetPayload<{ select: typeof searchRowSelect }>;

// What is stored in Elasticsearch (dates as ISO strings, which is also what search returns).
export type EmailDocument = Omit<SearchRow, 'scheduledAt' | 'sentAt' | 'updatedAt'> & {
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
};

// Hits carry a one-line preview of the body instead of the whole body.
export type SearchHit = Omit<EmailDocument, 'body'> & { preview: string; score: number | null };

// keyword = exact value, used for filters (userId, status). text = analysed into words, used for
// full-text matching. toEmail's standard analyser splits "alice@acme.com" into "alice" and
// "acme.com", so searching for either finds it.
// search_as_you_type = text that ALSO indexes every word's beginnings ("h", "ho", "hou"...), so
// typing the first letters of a word finds it instantly and completely.
// dynamic 'strict' rejects documents with unknown fields instead of silently guessing a mapping.
const mappings = {
  dynamic: 'strict',
  properties: {
    id: { type: 'keyword' },
    userId: { type: 'keyword' },
    campaignId: { type: 'keyword' },
    status: { type: 'keyword' },
    toEmail: { type: 'search_as_you_type' },
    subject: { type: 'search_as_you_type' },
    body: { type: 'text' },
    scheduledAt: { type: 'date' },
    sentAt: { type: 'date' },
    updatedAt: { type: 'date' },
    // Stored for display only, never searched.
    previewUrl: { type: 'keyword', index: false },
    error: { type: 'keyword', index: false },
  },
} as const;

// Creates the index with our mapping if it doesn't exist. Called on API start, before any
// email is indexed, so Elasticsearch never auto-creates it with guessed field types.
export async function ensureSearchIndex(): Promise<void> {
  if (await elastic.indices.exists({ index })) return;
  try {
    await elastic.indices.create({ index, mappings });
    logger.info({ index }, 'Elasticsearch index created');
  } catch (err) {
    // Another process created it between our exists() and create(): that's fine.
    const alreadyExists =
      err instanceof esErrors.ResponseError && err.body?.error?.type === 'resource_already_exists_exception';
    if (!alreadyExists) throw err;
  }
}

function toDocument(row: SearchRow): EmailDocument {
  return {
    ...row,
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Bulk-writes rows, SEARCH_BULK_CHUNK_SIZE per request. Throws if Elasticsearch is unreachable.
// version = updatedAt (external versioning): if two updates of the same email arrive out of
// order, Elasticsearch rejects the older one with a 409 instead of overwriting newer data.
export async function bulkIndexRows(rows: SearchRow[]): Promise<{ indexed: number; failed: number }> {
  let indexed = 0;
  let failed = 0;
  for (let start = 0; start < rows.length; start += SEARCH_BULK_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + SEARCH_BULK_CHUNK_SIZE);
    const operations = chunk.flatMap((row) => [
      { index: { _index: index, _id: row.id, version: row.updatedAt.getTime(), version_type: 'external_gte' as const } },
      toDocument(row),
    ]);
    const result = await elastic.bulk({ operations }, { requestTimeout: EXTERNAL_CALL_TIMEOUT_MS, maxRetries: 0 });

    for (const item of result.items) {
      const { status, error } = item.index ?? {};
      if (!error) indexed++;
      // 409 = we already have a newer version of this email: nothing to do.
      else if (status !== 409) {
        failed++;
        logger.warn({ emailId: item.index?._id, error }, 'Elasticsearch rejected email document');
      }
    }
  }
  return { indexed, failed };
}

// Re-reads the rows from Postgres so the index always gets their CURRENT state, then indexes them.
// Never throws: a search-index problem must not fail a schedule request or an email job.
export async function syncEmailsToSearch(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return;
  try {
    const rows = await prisma.email.findMany({ where: { id: { in: emailIds } }, select: searchRowSelect });
    await bulkIndexRows(rows);
  } catch (err) {
    logger.warn({ err, count: emailIds.length }, 'Search indexing failed; run npm run es:reindex to repair');
  }
}

export async function findRowsForReindex(afterId: string | undefined, take: number): Promise<SearchRow[]> {
  return prisma.email.findMany({
    select: searchRowSelect,
    orderBy: { id: 'asc' },
    take,
    // Keyset pagination: "id > last id seen" stays fast however far into the table we are.
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
  });
}

export interface SearchParams extends Pagination {
  q: string;
  tab?: EmailTab;
  status?: EmailStatus;
}

export async function searchEmails(userId: string, { q, tab, status, ...pagination }: SearchParams): Promise<Page<SearchHit>> {
  const { skip, take } = toSkipTake(pagination);
  try {
    const result = await elastic.search<EmailDocument>(
      {
        index,
        from: skip,
        size: take,
        track_total_hits: true,
        query: {
          bool: {
            // Boosts: a hit in the subject counts 3x, in the recipient 2x, in the body 1x.
            // An email matches if EITHER query matches; when both do, the scores add up.
            should: [
              // As you type: the last word is a prefix ("h" -> "hourly", "ali" -> "alice@...").
              // The ._2gram/._3gram subfields of search_as_you_type also reward words typed in order.
              {
                multi_match: {
                  query: q,
                  type: 'bool_prefix',
                  fields: ['subject^3', 'subject._2gram^3', 'subject._3gram^3', 'toEmail^2', 'toEmail._2gram^2', 'toEmail._3gram^2', 'body'],
                },
              },
              // Whole words with typos: fuzziness AUTO allows 1 edit for 3-5 letter words, 2 for longer.
              { multi_match: { query: q, fields: ['subject^3', 'toEmail^2', 'body'], fuzziness: 'AUTO' } },
            ],
            minimum_should_match: 1,
            // filter (not must): exact, not scored, and cached. userId is ALWAYS applied, so a
            // user can only ever find their own emails.
            filter: [
              { term: { userId } },
              ...(status ? [{ term: { status } }] : tab ? [{ terms: { status: TAB_STATUSES[tab] } }] : []),
            ],
          },
        },
        // Best match first; among equal scores, the most recently updated.
        sort: ['_score', { updatedAt: 'desc' }],
      },
      { requestTimeout: EXTERNAL_CALL_TIMEOUT_MS },
    );

    const items = result.hits.hits.map((hit) => {
      const { body, ...doc } = hit._source as EmailDocument;
      return { ...doc, preview: bodyPreview(body), score: hit._score ?? null };
    });
    const total = typeof result.hits.total === 'number' ? result.hits.total : (result.hits.total?.value ?? 0);
    return buildPage(items, total, pagination);
  } catch (err) {
    logger.error({ err }, 'Elasticsearch search failed');
    throw new HttpError(503, 'Search is temporarily unavailable');
  }
}
