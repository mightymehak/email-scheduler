import { Link, useLocation } from 'react-router';
import { formatDateTime, formatShortDateTime } from '../../lib/format';
import type { EmailRow, EmailTab } from '../../lib/types';
import { StatusPill } from './StatusPill';

// One inbox-style row: "To: … | pill | Subject - preview…", with the sent time on the right for
// the Sent folder. The whole row opens the email.
export function EmailRowItem({ email, tab, nowMs }: { email: EmailRow; tab: EmailTab; nowMs: number }) {
  const location = useLocation();
  const failed = email.status === 'FAILED' && email.error;
  // FAILED rows never got a sentAt; updatedAt is when the last attempt gave up.
  const finishedAt = email.sentAt ?? email.updatedAt;

  return (
    <li className="border-b border-neutral-100">
      <Link
        to={`/emails/${email.id}`}
        // Lets the detail page's back arrow return to this exact folder, page and search.
        state={{ from: location.pathname + location.search }}
        className="flex flex-col gap-1.5 px-4 py-4 transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-6"
      >
        <span className="truncate text-neutral-900 sm:w-60 sm:shrink-0" title={email.toEmail}>
          To: {email.toEmail}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusPill email={email} nowMs={nowMs} />
          <p className="min-w-0 truncate">
            <span className="text-neutral-900">{email.subject}</span>
            {failed ? (
              <span className="text-red-600"> - {email.error}</span>
            ) : (
              email.preview && <span className="text-neutral-400"> - {email.preview}</span>
            )}
          </p>
        </div>

        {tab === 'sent' && (
          <time dateTime={finishedAt} title={formatDateTime(finishedAt)} className="shrink-0 text-sm text-neutral-500">
            {formatShortDateTime(finishedAt)}
          </time>
        )}
      </Link>
    </li>
  );
}
