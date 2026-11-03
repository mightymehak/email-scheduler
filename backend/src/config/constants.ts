// Fixed protocol / safety values. Operational knobs that you'd tune per deployment
// (rate limits, delays, concurrency, retries) live in env.ts instead.

// How long a best-effort read (health checks, dashboard usage counters) waits before giving up.
export const QUICK_CHECK_TIMEOUT_MS = 2_000;
// Upper bound for calls to third-party HTTP APIs (Ethereal, Slack) so a hung call can't hang a request.
export const EXTERNAL_CALL_TIMEOUT_MS = 10_000;
// An OAuth `state` is only valid for the few minutes the user spends on the consent screen.
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
// Large enough for a schedule request with thousands of recipient addresses.
export const JSON_BODY_LIMIT = '5mb';

// Jobs per queue.addBulk call: one Redis round trip per chunk without building a huge command.
export const ENQUEUE_CHUNK_SIZE = 500;
// Finished jobs are kept for a while so they're visible in Bull Board, then cleaned up by BullMQ.
// Postgres keeps the permanent history.
export const COMPLETED_JOB_RETENTION_SECONDS = 24 * 60 * 60;
export const FAILED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
// Documents per Elasticsearch bulk request (schedule-time indexing and the reindex script).
export const SEARCH_BULK_CHUNK_SIZE = 500;
// Unsent rows checked per batch by the worker's startup reconciliation.
export const RECONCILE_BATCH_SIZE = 1_000;
// Inserting thousands of email rows can exceed Prisma's 5s default interactive-transaction timeout.
export const SCHEDULE_TRANSACTION_TIMEOUT_MS = 30_000;

// Ethereal's SMTP server, used when a user adds an Ethereal account they created themselves.
export const ETHEREAL_SMTP_HOST = 'smtp.ethereal.email';
export const ETHEREAL_SMTP_PORT = 587;
// SMTP connections kept open per sender. The min gap between sends means one is usually enough.
export const SMTP_POOL_MAX_CONNECTIONS = 2;
// nodemailer's default socket timeout is 10 minutes; a hung SMTP server shouldn't hold a worker slot that long.
export const SMTP_TIMEOUT_MS = 30_000;
// A job that fires this much before its row's scheduledAt is put back to sleep (clock skew allowance).
export const EARLY_JOB_TOLERANCE_MS = 1_000;
// Hourly counters outlive their window by an hour, so a worker whose clock is slightly behind
// still finds the counter; Redis then deletes them on its own.
export const RATE_COUNTER_TTL_MS = 2 * 60 * 60 * 1000;
// Tries per Slack API call when Slack can't be reached at all (network error or timeout).
export const SLACK_CONNECT_ATTEMPTS = 2;
// After a failed Slack alert, the next limit hit may retry it this much later (not on every
// deferred email, which would make each one wait for a Slack timeout).
export const SLACK_ALERT_RETRY_MS = 60_000;
// Error text stored on the Email row is truncated to this length.
export const MAX_ERROR_LENGTH = 1_000;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SUBJECT_LENGTH = 300;
// Characters of the body shown after the subject in the dashboard's email rows.
export const BODY_PREVIEW_LENGTH = 140;
