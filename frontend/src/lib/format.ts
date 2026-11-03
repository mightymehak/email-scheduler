// `undefined` locale = the browser's own language and timezone.
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDateTimeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const weekdayTimeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const DAY_MS = 24 * 60 * 60 * 1000;

// "Nov 3, 2026, 11:46 AM": full date for detail views.
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

// "Nov 3, 11:46 AM": compact, for the right edge of a sent row.
export function formatShortDateTime(iso: string): string {
  return shortDateTimeFormat.format(new Date(iso));
}

// The scheduled-time pill: "Tue 9:15:12 AM" within the coming week (the weekday is unambiguous),
// otherwise "Nov 12, 9:15 AM" so a send next month isn't mistaken for this week.
export function formatPillTime(iso: string, nowMs: number = Date.now()): string {
  const diff = new Date(iso).getTime() - nowMs;
  return diff > -DAY_MS && diff < 6 * DAY_MS ? weekdayTimeFormat.format(new Date(iso)) : formatShortDateTime(iso);
}

// Biggest unit first; the first one that fits is used ("in 3 hours", not "in 180 minutes").
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

// "in 5 minutes", "2 hours ago". Under a minute we don't claim seconds precision: the labels are
// refreshed on a timer, so "in 9 seconds" could already be wrong when it's read.
export function formatRelative(iso: string, nowMs: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - nowMs) / 1000);
  if (Math.abs(seconds) < 60) return seconds > 0 ? 'in under a minute' : 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
