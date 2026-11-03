import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, buttonClasses } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { BellIcon } from '../../components/ui/icons';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { SLACK_CONNECT_URL, SLACK_STATUS_KEY, useDisconnectSlack, useSendSlackTest, useSlackStatus } from './useSlack';

// The API redirects back with ?slack=connected or ?slack=error&reason=<code> (backend slack.routes.ts).
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Slack connection was cancelled.',
  invalid_state: 'The Slack connection attempt expired. Please try again.',
  slack_unreachable: "Couldn't reach Slack (network problem). Please try connecting again.",
};

// Shows the OAuth result once as a toast, then removes it from the URL so a refresh doesn't repeat it.
function useSlackOAuthResult() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const result = params.get('slack');
  const reason = params.get('reason');

  useEffect(() => {
    if (!result) return;
    if (result === 'connected') toast('success', 'Slack connected. Rate-limit alerts will be posted to your channel.');
    else toast('error', (reason && OAUTH_ERRORS[reason]) ?? 'Could not connect Slack. Please try again.');
    void queryClient.invalidateQueries({ queryKey: SLACK_STATUS_KEY });
    setParams(
      (current) => {
        current.delete('slack');
        current.delete('reason');
        return current;
      },
      { replace: true },
    );
  }, [result, reason, queryClient, setParams, toast]);
}

const linkButton = 'text-xs font-medium text-neutral-500 hover:text-neutral-800';

export function SlackCard() {
  const status = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const sendTest = useSendSlackTest();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  useSlackOAuthResult();

  const connected = status.data?.connected === true;

  const onSendTest = () =>
    sendTest.mutate(undefined, {
      onSuccess: () => toast('success', 'Test message sent. Check your Slack channel.'),
      onError: (err) => toast('error', errorMessage(err)),
    });

  const onDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast('info', 'Slack disconnected.');
      },
      onError: (err) => toast('error', errorMessage(err)),
    });

  let detail;
  if (status.isPending) detail = <Spinner className="size-4 text-neutral-400" />;
  else if (status.isError) detail = <span className="text-red-600">{errorMessage(status.error)}</span>;
  else if (status.data.connected) detail = `${status.data.teamName}${status.data.channelName ? ` · ${status.data.channelName}` : ''}`;
  else detail = 'Get a message the moment a sender hits its hourly limit.';

  return (
    <section aria-label="Slack alerts" className="rounded-2xl border border-neutral-200 p-4">
      <div className="flex items-center gap-2">
        <BellIcon className="size-4 text-neutral-600" />
        <h2 className="flex-1 text-sm font-medium text-neutral-900">Slack alerts</h2>
        <span className={cn('size-2 rounded-full', connected ? 'bg-brand-500' : 'bg-neutral-300')} aria-hidden="true" />
        <span className="text-xs text-neutral-500">{connected ? 'Connected' : 'Off'}</span>
      </div>
      <p className="mt-1.5 truncate text-xs text-neutral-500" title={typeof detail === 'string' ? detail : undefined}>
        {detail}
      </p>

      <div className="mt-3">
        {status.isError ? (
          <Button size="sm" variant="secondary" onClick={() => void status.refetch()}>
            Retry
          </Button>
        ) : connected ? (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" pill loading={sendTest.isPending} onClick={onSendTest}>
              Send test
            </Button>
            {/* Reconnecting runs the same OAuth flow; it lets the user pick another channel. */}
            <a href={SLACK_CONNECT_URL} className={linkButton}>
              Reconnect
            </a>
            <button type="button" onClick={() => setConfirming(true)} className={cn(linkButton, 'hover:text-red-600')}>
              Disconnect
            </button>
          </div>
        ) : (
          !status.isPending && (
            <a href={SLACK_CONNECT_URL} className={buttonClasses({ variant: 'outline', size: 'sm', pill: true, className: 'w-full' })}>
              Connect Slack
            </a>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Disconnect Slack?"
        message="Rate-limit alerts will stop until you connect Slack again."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={onDisconnect}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
