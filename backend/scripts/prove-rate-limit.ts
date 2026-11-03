// Proves the rate-limit Lua script is race-free: fire many calls at the same instant, spread over
// several Redis connections (like several workers), and count how many were allowed.
//
//   npm run prove:rate-limit
//
// Uses throwaway ids, so it never touches real senders' counters.
import { randomUUID } from 'node:crypto';
import { closeClients, createRedis } from '../src/lib/clients.js';
import { acquireSendSlot, registerRateLimitScript, type SlotResult } from '../src/services/rate-limit.service.js';

const CALLS = 50;
const LIMIT = 10;
const CONNECTIONS = 5;

const connections = Array.from({ length: CONNECTIONS }, (_, i) => {
  const client = createRedis(`prove-${i}`);
  registerRateLimitScript(client);
  return client;
});

async function fireInParallel(build: () => Parameters<typeof acquireSendSlot>[0]): Promise<SlotResult[]> {
  const request = build();
  // All calls are started before any is awaited, round-robin across the connections.
  return Promise.all(
    Array.from({ length: CALLS }, (_, i) => acquireSendSlot(request, connections[i % CONNECTIONS])),
  );
}

function tally(results: SlotResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.code] = (counts[result.code] ?? 0) + 1;
  return counts;
}

function check(name: string, results: SlotResult[], expectedOk: number): boolean {
  const counts = tally(results);
  const passed = (counts.OK ?? 0) === expectedOk;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(counts)} (expected OK = ${expectedOk})`);
  return passed;
}

async function main(): Promise<void> {
  const results = [
    // 1. Sender hourly limit of 10, no gap: exactly 10 of 50 get through.
    check(
      `${CALLS} parallel calls, sender limit ${LIMIT}`,
      await fireInParallel(() => ({
        senderId: `proof-${randomUUID()}`,
        campaignId: `proof-${randomUUID()}`,
        senderLimit: LIMIT,
        campaignLimit: 1_000_000,
        gapMs: 0,
      })),
      LIMIT,
    ),
    // 2. Campaign hourly limit of 10, sender limit high: exactly 10 get through.
    check(
      `${CALLS} parallel calls, campaign limit ${LIMIT}`,
      await fireInParallel(() => ({
        senderId: `proof-${randomUUID()}`,
        campaignId: `proof-${randomUUID()}`,
        senderLimit: 1_000_000,
        campaignLimit: LIMIT,
        gapMs: 0,
      })),
      LIMIT,
    ),
    // 3. Min gap of 2s: only one send can start; the other 49 are told to wait.
    check(
      `${CALLS} parallel calls, 2000ms min gap`,
      await fireInParallel(() => ({
        senderId: `proof-${randomUUID()}`,
        campaignId: `proof-${randomUUID()}`,
        senderLimit: 1_000_000,
        campaignLimit: 1_000_000,
        gapMs: 2000,
      })),
      1,
    ),
  ];
  if (results.includes(false)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeClients());
