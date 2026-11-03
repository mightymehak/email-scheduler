// Loads .env into process.env before anything reads it.
import 'dotenv/config';
import { z } from 'zod';

// Env vars are always strings; coerce to a validated integer >= min.
const int = (min: number) => z.coerce.number().int().min(min);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: int(1).max(65535).default(4000),
  API_PUBLIC_URL: z.url(),
  FRONTEND_URL: z.url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: int(60).default(7 * 24 * 60 * 60),
  // stringbool parses "true"/"false"/"1"/"0"/"yes"/"no" (z.coerce.boolean would treat "false" as true).
  ALLOW_DEV_LOGIN: z.stringbool().default(false),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  ELASTICSEARCH_URL: z.url(),
  ELASTICSEARCH_INDEX: z.string().min(1).default('emails'),

  // OAuth credentials are optional so the stack can boot before they are set up;
  // the OAuth routes respond with 503 until they are configured.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.url().optional(),

  MAX_RECIPIENTS_PER_CAMPAIGN: int(1).default(10_000),
  QUEUE_NAME: z.string().min(1).default('email-send'),
  WORKER_CONCURRENCY: int(1).default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: int(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: int(1).default(200),
  JOB_ATTEMPTS: int(1).default(3),
  JOB_BACKOFF_MS: int(0).default(5000),
  STALE_LOCK_MS: int(1000).default(300_000),
  GLOBAL_LIMITER_MAX: int(0).default(0),
  GLOBAL_LIMITER_DURATION_MS: int(1).default(1000),

  BULL_BOARD_USER: z.string().optional(),
  BULL_BOARD_PASS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Treat `KEY=` (empty) in .env as "not set", so defaults and optional() behave as expected.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Logger isn't available yet (it depends on env), so print directly and fail fast.
    console.error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
// Dev login is a Postman/load-test convenience and must never be reachable in production.
export const devLoginEnabled = env.ALLOW_DEV_LOGIN && !isProduction;
