// Redis key names and hour-window maths shared by the API (usage display) and the
// worker (enforcement), so both always read/write the same counters.

export const HOUR_MS = 60 * 60 * 1000;

// Fixed clock-hour windows: 14:00:00-14:59:59 is one window, numbered since the Unix epoch.
export function hourWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / HOUR_MS);
}

export function windowStartMs(window: number): number {
  return window * HOUR_MS;
}

// Exists for MIN_DELAY_BETWEEN_SENDS_MS after a sender's last send; while it exists, that sender must wait.
export function senderGapKey(senderId: string): string {
  return `rl:gap:${senderId}`;
}

// Emails sent by one sender in one hour window.
export function senderHourKey(senderId: string, window: number): string {
  return `rl:sender:${senderId}:${window}`;
}

// Emails sent by one campaign in one hour window.
export function campaignHourKey(campaignId: string, window: number): string {
  return `rl:campaign:${campaignId}:${window}`;
}

// Set once a Slack alert for this limit and hour window has gone out, so the alert fires once per
// hour even when several workers hit the limit at the same moment.
export function slackAlertKey(scope: 'sender' | 'campaign', id: string, window: number): string {
  return `slack:notified:${scope}:${id}:${window}`;
}
