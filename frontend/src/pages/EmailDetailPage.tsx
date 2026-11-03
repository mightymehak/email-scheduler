import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button, IconButton, buttonClasses } from '../components/ui/Button';
import { ArrowLeftIcon, ExternalLinkIcon } from '../components/ui/icons';
import { LoadingState } from '../components/ui/Spinner';
import { useCurrentUser } from '../features/auth/useAuth';
import { StatusPill } from '../features/emails/StatusPill';
import { tabPath } from '../features/emails/useTabParam';
import { useEmailDetail } from '../features/emails/useEmails';
import { ApiError, errorMessage } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/format';
import type { EmailDetail } from '../lib/types';

function DeliveryNote({ email }: { email: EmailDetail }) {
  if (email.status === 'FAILED') {
    return (
      <Alert tone="error">
        Sending failed after {email.attempts} {email.attempts === 1 ? 'attempt' : 'attempts'}: {email.error}
      </Alert>
    );
  }
  if (email.status === 'SCHEDULED' || email.status === 'PROCESSING') {
    return (
      <Alert tone="info">
        {email.status === 'PROCESSING' ? 'Sending now.' : `Scheduled for ${formatDateTime(email.scheduledAt)} (${formatRelative(email.scheduledAt)}).`}
        {email.deferrals > 0 && ` Moved to a later hour by the campaign's ${email.hourlyLimit}/hour limit.`}
      </Alert>
    );
  }
  return null;
}

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user } = useCurrentUser();
  const { data: email, error, isPending, refetch } = useEmailDetail(id);

  // Back to the exact folder/page the row was opened from; a direct visit falls back to the folder.
  const from = (location.state as { from?: string } | null)?.from;
  const goBack = () => navigate(from ?? tabPath(email && ['SENT', 'FAILED'].includes(email.status) ? 'sent' : 'scheduled'));

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <IconButton label="Back" onClick={goBack}>
          <ArrowLeftIcon className="size-6 text-neutral-800" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-2xl text-neutral-900">{email?.subject ?? ''}</h1>
        {email?.previewUrl && (
          // Ethereal's web view of the delivered message.
          <a href={email.previewUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm', pill: true })}>
            <ExternalLinkIcon className="size-4" />
            View on Ethereal
          </a>
        )}
        {user && <Avatar name={user.name} src={user.avatarUrl} className="size-10" />}
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        {isPending ? (
          <LoadingState label="Loading email…" />
        ) : !email ? (
          <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={() => void refetch()}>Retry</Button>}>
            {error instanceof ApiError && error.status === 404 ? 'This email does not exist.' : errorMessage(error)}
          </Alert>
        ) : (
          <article className="space-y-6 pt-4">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={email.sender.name} src={null} className="size-12 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-semibold text-neutral-900">{email.sender.name}</span>{' '}
                  <span className="text-sm text-neutral-500">&lt;{email.sender.email}&gt;</span>
                </p>
                <p className="truncate text-sm text-neutral-500">to {email.toEmail}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusPill email={email} nowMs={Date.now()} />
                <time dateTime={email.sentAt ?? email.scheduledAt} className="text-sm text-neutral-500">
                  {formatDateTime(email.sentAt ?? email.scheduledAt)}
                </time>
              </div>
            </div>

            <DeliveryNote email={email} />

            {/* Plain-text body: whitespace-pre-wrap keeps the line breaks the user typed. */}
            <div className="whitespace-pre-wrap break-words pl-0 text-neutral-800 sm:pl-16">{email.body}</div>
          </article>
        )}
      </main>
    </div>
  );
}
