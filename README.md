# ONB · Email Scheduler

A full-stack service that schedules email campaigns and sends them through Ethereal SMTP.
Sends survive restarts, are throttled per sender, and are never sent twice.

- **Backend:** TypeScript, Express 5, BullMQ + Redis, PostgreSQL (Prisma), Elasticsearch, Nodemailer
- **Frontend:** React 19, Vite, Tailwind CSS v4, TanStack Query, React Router
- **Integrations:** Google OAuth login, Slack OAuth with live rate-limit alerts, Bull Board

| | |
|---|---|
| **Live app** | https://postlaryngeal-overtechnical-inger.ngrok-free.dev. On the first visit, ngrok's free plan shows a "You are about to visit…" page: click **Visit Site**. |
| **Queue dashboard** | `/admin/queues` on the same URL (basic auth; credentials shared with the submission) |
| **Demo video** | _link added in the submission form_ |

---

## Contents
1. [Features](#features)
2. [Architecture](#architecture)
3. [Running it locally](#running-it-locally)
4. [Configuration](#configuration)
5. [Third-party setup: Ethereal, Google, Slack, ngrok](#third-party-setup)
6. [How it works](#how-it-works)
7. [Behaviour under load](#behaviour-under-load)
8. [API](#api)
9. [Requirement → implementation map](#requirement--implementation-map)
10. [Trade-offs, assumptions and known limits](#trade-offs-assumptions-and-known-limits)
11. [Project structure](#project-structure)
12. [Verification scripts](#verification-scripts)

---

## Features

**Scheduling and delivery**
- Schedule a campaign (subject, body, up to 10,000 recipients, start time, delay between emails, hourly limit). Each recipient becomes its own email row and its own BullMQ delayed job.
- Multiple senders: each sender is a separate Ethereal SMTP account with its own hourly limit and send gap. Senders are generated with one click, or you can add an Ethereal account you already have (its SMTP login is checked before it is saved).
- At most one send in progress per sender, a minimum gap between sends, and per-sender and per-campaign hourly limits, all enforced atomically in Redis so they hold across any number of workers.
- Emails over a limit are moved to the next free slot in a later hour, in their original order. They are never dropped or failed.
- Retries with exponential backoff for real SMTP failures. After the last attempt the email is marked **Failed** with the SMTP error.
- Restart-safe: on start, every worker reconciles Postgres with Redis and re-creates any missing jobs.

**Dashboard**
- Google login (real OAuth), with the user's name, email and avatar in the sidebar, and logout.
- **Scheduled** and **Sent** folders with counts, live refresh every 5s, pagination, a status filter and a manual refresh.
- Search as you type through Elasticsearch: prefix matching ("h" finds "Hourly"), typo tolerance, filtered per user and per folder.
- Email detail page: sender, recipient, time, status, failure reason, and a link to the delivered message on Ethereal.
- Compose page: From (sender picker, add sender), To (recipient chips, typing or pasting addresses, **Upload List** for CSV/TXT with a count of detected, duplicate and invalid addresses), Subject, delay between emails, hourly limit, message, and **Send Later** with presets.
- Slack card: connect, send a test message, reconnect, disconnect.
- Loading, empty and error states everywhere; toasts for results; works at phone width.

---

## Architecture

```
                  Browser
                     │  one domain (localhost:3000, or the public ngrok URL)
                     ▼
        ┌─────────────────────────┐
        │  Frontend server (Vite) │  serves the React app, and forwards
        │  :3000                  │  /api /auth /admin /health  ─────────────┐
        └─────────────────────────┘                                          │
                                                                             ▼
   ┌──────────────────────────────────────────────┐        ┌─────────────────────────────┐
   │  API  (Express, src/server.ts)  :4000        │        │  Worker(s) (src/worker.ts)  │
   │  • Google + Slack OAuth, sessions (JWT)      │        │  • BullMQ Worker, N jobs     │
   │  • schedule → Postgres rows + delayed jobs   │        │    in parallel per process   │
   │  • lists, search, stats, senders             │        │  • claim → rate-limit → SMTP │
   │  • Bull Board at /admin/queues               │        │  • Slack alert on limit hit  │
   └──────┬──────────────┬──────────────┬─────────┘        │  • startup reconciliation    │
          │              │              │                  └──┬──────────┬────────────┬───┘
          ▼              ▼              ▼                     │          │            │
   ┌────────────┐ ┌─────────────┐ ┌──────────────┐           │          │            ▼
   │ PostgreSQL │ │ Redis       │ │Elasticsearch │◄──────────┘          │     Ethereal SMTP
   │ source of  │ │ BullMQ jobs │ │ search index │  re-index on         │     Slack API
   │ truth      │ │ rate limits │ │              │  status change       │
   └────────────┘ └─────────────┘ └──────────────┘                      │
          ▲              ▲                                              │
          └──────────────┴──────────────────────────────────────────────┘
```

- **Postgres is the source of truth.** Every email is a row with its status and planned time. A BullMQ job carries only the email id; the worker always reads the latest row.
- **The API and the worker are separate processes** (`src/server.ts`, `src/worker.ts`). They share no memory, only Postgres and Redis, so you can run as many workers as you like.
- **One domain for everything.** The frontend server forwards backend paths to the API, so the session cookie is first-party and a single ngrok tunnel exposes the whole app.

---

## Running it locally

**Prerequisites:** Node 20+, Docker Desktop.

```bash
# 1. Infrastructure: Postgres 16, Redis 7 (append-only file on), Elasticsearch 8.19
docker compose up -d
docker compose ps                     # wait until all three are "healthy"

# 2. Backend
cd backend
cp .env.example .env                  # then fill in JWT_SECRET (and Google/Slack, see below)
npm install                           # also generates the Prisma client
npm run db:deploy                     # create the tables
npm run dev                           # API + worker together (tsx watch)

# 3. Frontend (second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                           # http://localhost:3000 (or `npm run serve` for the production build)
```

`npm run dev` in `backend/` runs **both** the API and the worker. `npm run dev:api` on its own schedules emails but nothing sends them. To run more workers, start `npm run dev:worker` in more terminals.

**Production build:** `npm run build`, then `npm run start:api` and `npm run start:worker` (backend); `npm run serve` (frontend).

---

## Configuration

Every limit, delay and concurrency setting comes from `backend/.env`, and the values are checked with zod when the process starts. Invalid config stops the process with a clear message. Fixed protocol and safety values (timeouts, batch sizes) live in `src/config/constants.ts`.

| Variable | Default | Meaning |
|---|---|---|
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | **Minimum 2 seconds between two sends of the same sender**, measured from when the previous send finished |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Hourly cap per sender (each campaign also has its own cap, chosen in Compose) |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel by one worker process |
| `JOB_ATTEMPTS` / `JOB_BACKOFF_MS` | `3` / `5000` | SMTP retries with exponential backoff (5s, 10s, …) |
| `STALE_LOCK_MS` | `300000` | When a `PROCESSING` email counts as abandoned by a crashed worker |
| `GLOBAL_LIMITER_MAX` / `GLOBAL_LIMITER_DURATION_MS` | `0` (off) / `1000` | Optional BullMQ limiter across all workers |
| `MAX_RECIPIENTS_PER_CAMPAIGN` | `10000` | Upper bound per schedule request |
| `QUEUE_NAME` | `email-send` | BullMQ queue name |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX` | local Docker values | Connections |
| `PORT` | `4000` | API port |
| `API_PUBLIC_URL`, `FRONTEND_URL` | `http://localhost:3000` | Public address of the app (CORS, redirects after OAuth, Message-ID domain) |
| `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS` | –, 7 days | Session signing |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | – | Google login |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` | – | Slack OAuth |
| `BULL_BOARD_USER`, `BULL_BOARD_PASS` | – | Basic auth for `/admin/queues` (set both; change the example password) |
| `ALLOW_DEV_LOGIN` | `true` | Password-less login for scripts. Never available in production, and only answers requests made directly on the machine (never through the proxy or a tunnel). |

`frontend/.env` only needs `API_PROXY_TARGET` (where the API runs, default `http://localhost:4000`).

---

## Third-party setup

### Ethereal (no setup needed)
[Ethereal](https://ethereal.email) is a fake SMTP service: it accepts mail but never delivers it, and keeps every message viewable on its website.
- The first login creates a **default sender** automatically (`nodemailer.createTestAccount()`).
- **Compose → From → + Add new sender** either generates another account, or adds an account you created at ethereal.email/create (enter its address and password; the SMTP login is checked before saving). Log in at ethereal.email with those credentials to see that sender's mailbox.
- Every sent email has a **View** link (its Ethereal preview URL), shown on the detail page.

### Google OAuth
1. Google Cloud Console → APIs & Services → **OAuth consent screen**: External, add your email; to let other people sign in, **Publish app** (name/email/profile scopes need no review).
2. **Credentials → Create OAuth client ID → Web application.** Authorized redirect URI: `<APP_URL>/auth/google/callback` (e.g. `http://localhost:3000/auth/google/callback`).
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to the same callback.

### Slack app
1. api.slack.com/apps → **Create New App → From scratch**.
2. **OAuth & Permissions → Redirect URLs:** `<HTTPS_APP_URL>/api/slack/callback`. Bot token scopes: **`incoming-webhook`** and **`chat:write`**.
3. **Incoming Webhooks:** turn on.
4. Copy the client ID and secret into `.env`, and set `SLACK_REDIRECT_URI`.
5. In the dashboard click **Connect Slack**, choose a channel, and click **Allow**.

Slack only redirects to **HTTPS** addresses, so locally you need a tunnel (next section).

### Sharing the app with ngrok
Because the frontend server forwards all backend paths, **one tunnel to port 3000 exposes the whole app**:
```bash
ngrok http --url=<your-static-domain>.ngrok-free.dev 3000
```
Then set `API_PUBLIC_URL` and `FRONTEND_URL` to `https://<your-static-domain>.ngrok-free.dev`, point both OAuth redirect URIs at that domain, and restart the backend. Use a free **static** ngrok domain, so the URL doesn't change between restarts.

---

## How it works

### Scheduling (no cron)
`POST /api/campaigns/schedule`:
1. The request is validated with zod. Recipients are trimmed, lower-cased, de-duplicated and checked as email addresses.
2. In **one database transaction**, the campaign and one `Email` row per recipient are inserted. Recipient *i* is planned for `start + i × delay` (`scheduledAt`; `originalScheduledAt` keeps that first plan).
3. **After the commit**, one BullMQ job is added per email (`addBulk`, 500 per call) with `delay = scheduledAt − now`. Enqueueing happens only after the commit, so a job can never point at a row that was rolled back.
4. The emails are indexed in Elasticsearch.

BullMQ keeps delayed jobs in a Redis sorted set ordered by run time, and moves them to the waiting list when they're due. Nothing polls, and there are no cron jobs.

### What a worker does with one job (`src/workers/email.processor.ts`)
1. **Load the row.** Skip if it no longer exists or is already `SENT`/`FAILED`. If the row's `scheduledAt` is later than the job's time (it was rescheduled), go back to sleep until then.
2. **Claim it atomically:** `UPDATE … SET status='PROCESSING', lockedAt=now() WHERE id=? AND (status='SCHEDULED' OR (status='PROCESSING' AND lockedAt < now − STALE_LOCK_MS))`. Only one worker can win this conditional update. A row whose lock is old belonged to a crashed worker and may be taken over.
3. **Ask Redis for a send slot.** One Lua script checks, in this order and atomically:
   - **Gap:** is another send of this sender in progress, or cooling down? → wait the remaining time.
   - **Sender hourly counter** `rl:sender:{senderId}:{hourWindow}` at the limit? → defer.
   - **Campaign hourly counter** `rl:campaign:{campaignId}:{hourWindow}` at the limit? → defer.
   - Otherwise increment both counters and take the sender's "sending" lease.
4. **Send through SMTP** (a pooled Nodemailer transport per sender). The Message-ID is derived from the email id.
5. **Mark it `SENT`** (with `sentAt`, the message id and the Ethereal preview URL), start the sender's cooldown, and re-index it in Elasticsearch.

Waiting (gap) and deferring (hourly limit) use BullMQ's `moveToDelayed` + `DelayedError`. The job goes back to the delayed set **without** using up a retry attempt and without counting as a failure.

### Persistence across restarts
- **Redis** runs with an append-only file (`appendonly yes`, fsync every second), so delayed jobs survive a Redis restart.
- **Postgres** holds every email row with its status and planned time.
- **Startup reconciliation** (`src/workers/reconcile.ts`): every time a worker starts it
  1. puts `PROCESSING` rows with a stale lock back to `SCHEDULED`, and
  2. walks every unsent row, 1,000 at a time. If a row has no job in Redis (or only a finished one), it creates the job again with `jobId = email.id`. Overdue emails are sent straight away; future ones keep their time. `SENT`/`FAILED` rows are never touched.

  This also recovers campaigns whose enqueue step failed (the API then answers `enqueued: false`).
- Graceful shutdown: on SIGINT/SIGTERM a worker stops taking jobs and waits for sends already in progress to finish.

### Idempotency (no email sent twice)
- **One job per email:** `jobId = email.id`, and BullMQ ignores an add whose id already exists. Reconciliation can run any number of times, from any number of workers.
- **One sender of each row:** the conditional claim above means only one worker can hold a row at a time.
- **Finished rows are final:** jobs for `SENT`/`FAILED` rows exit immediately.
- **No duplicate recipients:** a unique index on `(campaignId, toEmail)`.

### Concurrency and the minimum delay
- Each worker process runs `WORKER_CONCURRENCY` jobs at once. Total parallelism is concurrency × worker processes.
- Correctness never relies on in-memory state: the claim is in Postgres, and the gap and counters are in Redis.
- **Minimum delay: 2 seconds between sends of the same sender** (`MIN_DELAY_BETWEEN_SENDS_MS`). The Redis key `rl:gap:{senderId}` holds a short `sending` lease while an SMTP call is in progress, then a `cooldown` lasting exactly the configured gap, starting when that send *finishes*. With 2 workers × 5 concurrency and 6 emails due at the same instant, the smallest gap measured between consecutive sends was **2.58 s**.
- Different senders don't wait for each other.

### Hourly rate limiting
- Two limits, and whichever is stricter wins:
  - **per sender:** `MAX_EMAILS_PER_HOUR_PER_SENDER` (env), and
  - **per campaign:** the "Hourly limit" chosen in Compose.
- Counters are Redis keys per **fixed clock hour** (`floor(now / 1h)`), e.g. `rl:sender:{id}:{window}`. They expire automatically two hours later.
- The check and the increment happen in **one Lua script**. Redis runs a script without interleaving other commands, so 50 simultaneous attempts across 5 connections never get past the limit (`npm run prove:rate-limit`).
- **When the limit is reached the email is rescheduled, never dropped:**
  - its position *n* = the number of unsent emails of the same sender (or campaign) that come before it in the original order (`originalScheduledAt`, then `sequence`);
  - its new time = start of hour `next + ⌊n / limit⌋`, plus `(n mod limit) × gap`.

  So the backlog fills later hours in order, at most `limit` per hour. The row's `scheduledAt` is updated, which means the dashboard shows the real send time and reconciliation keeps it.

### Slack alert when a limit is hit
- **Connect Slack** runs the real OAuth v2 flow. The callback exchanges the code at `oauth.v2.access` and stores the bot token, the channel and its incoming webhook **per user** (reconnecting overwrites the old connection).
- When a worker defers an email because of a limit, `notifyRateLimitHit()`:
  1. looks up the user's Slack connection **at that moment** (not cached), so connecting or disconnecting takes effect without a restart. Not connected → it returns silently;
  2. claims `slack:notified:{sender|campaign}:{id}:{hour}` with Redis `SET NX`, so the alert goes out **once per sender (or campaign) per hour**, even with several workers;
  3. posts a Block Kit message (sender, limit, campaign, when sending resumes) to the webhook, falling back to `chat.postMessage`.

  It never throws into the job. If Slack is down, it can retry a minute later.

### Search
- Elasticsearch index with a strict mapping: `keyword` for ids, user and status; `search_as_you_type` for subject and recipient; `text` for the body; `date` for the times.
- Documents are bulk-indexed when a campaign is scheduled, and re-indexed whenever a visible status changes (deferred, sent, failed). External versioning by `updatedAt` makes late, out-of-order updates harmless.
- Each query combines a prefix match (`bool_prefix`) with a fuzzy whole-word match. Boosts: subject ×3, recipient ×2, body ×1. It always filters by the logged-in user, and by folder or status.
- Indexing is best effort: if Elasticsearch is down, emails still schedule and send. `npm run es:reindex` rebuilds the index from Postgres.

---

## Behaviour under load

When **1,000+ emails are due at the same moment** for one sender:
- They're accepted in a single request (one transaction plus 2 `addBulk` calls; about 1–2 s for 1,000).
- Workers pick them up concurrently, but the gap lease lets only one SMTP send per sender run at a time; the others wait in the delayed set without using retries.
- After `limit` sends in the current hour, every further email is deferred to its ordered slot in the following hours, and one Slack alert goes out.

Measured with `npm run load-test -- --count 1000` and a sender limit of 3 per hour on 2 workers:
- all 1,000 settled in **16 s**: 3 sent, **997 rescheduled**;
- **0 failed or dropped**, **at most 3 per later hour**, **0 out of order**.

In a separate run, both workers were killed with SIGKILL in the middle of a campaign: 12 of 12 were sent, with **0 duplicates**.

---

## API

All routes except auth and health need a session (an httpOnly cookie, or `Authorization: Bearer <token>`).

| Method & path | Purpose |
|---|---|
| `GET /auth/google` → `GET /auth/google/callback` | Google OAuth login (signed `state` + nonce cookie against login CSRF) |
| `GET /auth/me`, `POST /auth/logout` | Current user; log out |
| `POST /auth/dev-login` | Script-only login (local requests only; disabled in production) |
| `POST /api/campaigns/schedule` | Schedule a campaign → `{ campaign, sender, scheduledCount, firstSendAt, lastSendAt, enqueued }` |
| `GET /api/campaigns` | Campaigns with per-status counts |
| `GET /api/emails?tab=scheduled\|sent&status=&page=&pageSize=` | Folder list |
| `GET /api/emails/search?q=&tab=&status=` | Elasticsearch search |
| `GET /api/emails/stats`, `GET /api/emails/:id` | Counts; one email |
| `GET /api/senders`, `POST /api/senders` | Senders with this hour's usage; add a sender (`{name}` or `{name, email, password}`) |
| `GET /api/slack/connect` → `GET /api/slack/callback` | Slack OAuth |
| `GET /api/slack/status`, `POST /api/slack/test`, `DELETE /api/slack` | Status; test message; disconnect |
| `GET /health` | Postgres, Redis and Elasticsearch status |
| `/admin/queues` | Bull Board (basic auth) |

Example:
```bash
curl -X POST localhost:4000/api/campaigns/schedule -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"subject":"Hello","body":"Hi there","emails":["a@example.com","b@example.com"],
       "startTime":"2026-11-04T10:00:00Z","delayBetweenMs":2000,"hourlyLimit":50}'
```

---

## Requirement → implementation map

| Requirement | Where |
|---|---|
| Schedule via API, stored in Postgres | `POST /api/campaigns/schedule` → `campaign.service.ts`, `prisma/schema.prisma` |
| BullMQ delayed jobs, no cron | `queues/email.queue.ts` (`delay`, `jobId = email.id`) |
| Multiple senders via Ethereal | `sender.service.ts`, `mailer.service.ts`, Compose → From |
| Searchable via Elasticsearch | `search.service.ts`, `GET /api/emails/search`, search bar |
| Live BullMQ dashboard | `routes/bull-board.ts` → `/admin/queues` |
| Survives restarts, no duplicates | `workers/reconcile.ts`, conditional claim in `email.processor.ts`, Redis AOF |
| Configurable concurrency, safe in parallel | `WORKER_CONCURRENCY`, `workers/email.worker.ts`, Postgres claim |
| Minimum delay between sends | `rate-limit.service.ts` (gap lease + cooldown), `MIN_DELAY_BETWEEN_SENDS_MS` |
| Hourly limit, configurable, safe across workers, reschedule in order | `rate-limit.service.ts` (Lua script, Redis counters, `computeDeferredSendTime`) |
| Slack OAuth + live alert on limit hit, disconnect/reconnect | `slack.service.ts`, `slack-notifier.service.ts`, `slack.routes.ts`, Slack card |
| Behaviour under load (1,000+) | Measured above; `scripts/load-test.ts`, `scripts/prove-rate-limit.ts` |
| Real Google login; header with name, email, avatar; logout | `auth.routes.ts`, `google-oauth.service.ts`, `UserMenu.tsx` |
| Dashboard with Scheduled and Sent, Compose button | `Sidebar.tsx`, `EmailsView.tsx` |
| Compose: subject, body, CSV/text upload with count, start time, delay, hourly limit | `ComposePage.tsx`, `RecipientsInput.tsx`, `SendLaterPopover.tsx` |
| Scheduled list: email, subject, scheduled time, status | `EmailRowItem.tsx` + `StatusPill.tsx` (time pill) |
| Sent list: email, subject, sent time, sent/failed | `EmailRowItem.tsx` (status pill + time) |
| Loading, empty and error states; toasts | `EmailsView.tsx`, `EmptyState.tsx`, `Toast.tsx` |
| Reusable components, typed API | `components/ui/*`, `lib/types.ts`, `lib/api.ts` |

---

## Trade-offs, assumptions and known limits

**Rate limiting**
- **Fixed clock-hour windows**, not a sliding window. They're simple, cheap and easy to see in the dashboard, but up to 2× the limit can go out across a window boundary (e.g. 200 at 10:59 and 200 at 11:00).
- **Counters count send attempts**, not successes. A send that fails still used its slot, which is conservative towards the provider.
- **Overflow slots** come from the email's position in the original order (a Postgres count). An earlier version used a Redis counter in arrival order, and that shuffled emails under load; position-based slots kept 1,000 emails in order. If two emails ever get the same slot, the Lua script still admits only `limit` of them, and the other is simply rescheduled again.
- **Waiting for the gap** moves a job through BullMQ's delayed set (one Redis round trip per wait) instead of holding a worker. It's cheap, but under heavy contention a job may bounce a few times before its turn.
- **No jitter** is added to send times.

**Delivery guarantees**
- **At-least-once in one narrow case:** if a worker dies *after* the SMTP server accepted an email but *before* the row was marked `SENT`, that email is sent again once its lock goes stale (`STALE_LOCK_MS`). Every other path is exactly-once.
- Reconciliation runs when a worker **starts**, not on a timer (there is no cron). A campaign whose enqueue failed (`enqueued: false`) starts sending at the next worker start.
- **No idempotency key on the schedule request:** sending the same request twice creates two campaigns (within one campaign, recipients are unique).

**Data and security**
- **Ethereal SMTP passwords are stored in plain text.** That's acceptable for throwaway test accounts; real credentials would need encryption at rest or a secret manager.
- **Disconnecting Slack doesn't revoke the bot token.** A Slack bot token belongs to the app's install in the whole workspace and is shared by everyone who connected that workspace, so revoking it would uninstall the app for all of them. Disconnect deletes our copy, and nothing is sent afterwards.
- The Slack OAuth `state` is a signed, 10-minute token carrying the user id, with no nonce cookie: the callback may arrive on another domain (the tunnel), where the app's cookies aren't sent. The Google flow does use a nonce cookie.
- **Elasticsearch is best effort.** Emails scheduled while it is down are missing from search until `npm run es:reindex`.

**Product and design**
- Emails are **plain text**, without attachments. The Figma's formatting toolbar, attachment clip, star, archive and delete icons were left out rather than shown as buttons that do nothing. The login page offers only Google, because there is no email/password account system.
- Added on top of the Figma, because the assignment needs them: the Slack card, sent times on Sent rows, a Failed status with its reason, pagination, a status filter, and toasts.
- The **Sent** folder is ordered by `updatedAt` (failed emails have no `sentAt`; a finished row never changes again).
- The minimum gap is measured from when the previous send **finished**, so the `sentAt` timestamps in the dashboard really are at least 2 seconds apart.
- The **hosted link is an ngrok tunnel** to the machine running the app. It stays online while that machine runs; the free plan shows ngrok's notice page on the first visit.

**Assumptions**
- A start time in the past means "start now".
- An Ethereal address is the sender's identity: Ethereal generates the address, and the sender's display name is free text.
- One user's data is never visible to another user (every query is scoped by user id, including search).

---

## Project structure

```
backend/
  prisma/schema.prisma            data model (User, Sender, Campaign, Email, SlackConnection)
  src/server.ts | worker.ts       the two entry points
  src/app.ts                      Express app (routes, auth, Bull Board, errors)
  src/config/                     env validation (zod), fixed constants
  src/queues/email.queue.ts       BullMQ queue + enqueue
  src/workers/                    processor, worker factory, startup reconciliation
  src/services/                   campaigns, emails, senders, mailer, rate limit, search, Slack, Google
  src/routes/ | middleware/ | lib/
  scripts/                        load test, rate-limit race proof, search reindex
frontend/
  src/pages/                      Login, Dashboard, Compose, Email detail
  src/features/                   auth, emails, compose, slack (hooks + feature components)
  src/components/ui | layout/     reusable components (Button, Modal, Toast, Badge…), sidebar
  src/lib/                        API client, types, formatting, small hooks
docker-compose.yml                Postgres, Redis, Elasticsearch
```

---

