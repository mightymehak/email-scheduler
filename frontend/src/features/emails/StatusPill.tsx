import { Badge } from '../../components/ui/Badge';
import { ClockIcon, HourglassIcon } from '../../components/ui/icons';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime, formatPillTime } from '../../lib/format';
import type { EmailStatus } from '../../lib/types';

// Only what the pill reads. Search hits have no deferrals count, so it's optional.
interface PillEmail {
  status: EmailStatus;
  scheduledAt: string;
  deferrals?: number;
}

// The coloured label in front of the subject: when a scheduled email will go out, or what
// happened to a sent one.
export function StatusPill({ email, nowMs }: { email: PillEmail; nowMs: number }) {
  switch (email.status) {
    case 'SCHEDULED': {
      const deferred = (email.deferrals ?? 0) > 0;
      const Icon = deferred ? HourglassIcon : ClockIcon;
      return (
        <Badge
          tone="orange"
          title={
            deferred
              ? `Moved to ${formatDateTime(email.scheduledAt)} by the hourly limit`
              : `Scheduled for ${formatDateTime(email.scheduledAt)}`
          }
        >
          <Icon className="size-4" />
          {formatPillTime(email.scheduledAt, nowMs)}
        </Badge>
      );
    }
    case 'PROCESSING':
      return (
        <Badge tone="blue" title="A worker is sending this email right now">
          <Spinner className="size-3.5" />
          Sending
        </Badge>
      );
    case 'SENT':
      return <Badge>Sent</Badge>;
    case 'FAILED':
      return <Badge tone="red">Failed</Badge>;
  }
}
