// Shapes of the backend's JSON responses. Dates arrive as ISO strings.

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';
export type EmailTab = 'scheduled' | 'sent';

// GET /api/emails?tab=
export interface EmailListItem {
  id: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  sequence: number;
  originalScheduledAt: string;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
  attempts: number;
  deferrals: number;
  previewUrl: string | null;
  error: string | null;
  // First characters of the body, shown after the subject in the email rows.
  preview: string;
}

// GET /api/emails/search: the Elasticsearch document, which has fewer fields than a list item.
export interface SearchHit {
  id: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
  previewUrl: string | null;
  error: string | null;
  preview: string;
  score: number | null;
}

// What an email row needs; both list items and search hits fit this shape.
export type EmailRow = SearchHit | EmailListItem;

// GET /api/emails/:id
export interface EmailDetail extends Omit<EmailListItem, 'preview'> {
  body: string;
  sender: { name: string; email: string };
  hourlyLimit: number;
  delayBetweenMs: number;
}

export interface EmailStats {
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
  total: number;
}

export type SlackStatus =
  | { connected: false }
  | { connected: true; teamName: string; channelName: string | null; connectedAt: string };

// GET /api/senders: an Ethereal SMTP account plus how much of this hour's limit it has used.
export interface Sender {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  createdAt: string;
  usage: {
    // null when the API couldn't read the counter from Redis.
    sentThisHour: number | null;
    hourlyLimit: number;
    windowResetsAt: string;
  };
}

// POST /api/campaigns/schedule
export interface ScheduleCampaignInput {
  subject: string;
  body: string;
  emails: string[];
  startTime: string;
  delayBetweenMs: number;
  hourlyLimit: number;
  senderId?: string;
}

export interface ScheduleCampaignResult {
  campaign: { id: string; subject: string };
  sender: Omit<Sender, 'usage'>;
  scheduledCount: number;
  firstSendAt: string;
  lastSendAt: string;
  // false: saved in the database, but the queue was unavailable; the worker re-queues on start.
  enqueued: boolean;
}
