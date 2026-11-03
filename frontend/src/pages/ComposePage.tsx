import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button, IconButton } from '../components/ui/Button';
import { ArrowLeftIcon, XIcon } from '../components/ui/icons';
import { useToast } from '../components/ui/Toast';
import { AddSenderPanel } from '../features/compose/AddSenderPanel';
import { RecipientsInput } from '../features/compose/RecipientsInput';
import { SenderPicker } from '../features/compose/SenderPicker';
import { SendLaterPopover } from '../features/compose/SendLaterPopover';
import { useScheduleCampaign, useSenders } from '../features/compose/useCompose';
import { tabPath } from '../features/emails/useTabParam';
import { ApiError, errorMessage } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import type { ScheduleCampaignResult, Sender } from '../lib/types';

const MAX_SUBJECT_LENGTH = 300; // same limit as the backend

type FieldName = 'sender' | 'recipients' | 'subject' | 'delay' | 'hourlyLimit' | 'body';
type FieldErrors = Partial<Record<FieldName, string>>;

// The API names some fields differently from the form (e.g. delayBetweenMs vs delay).
const SERVER_FIELD_TO_FORM: Record<string, FieldName> = {
  senderIds: 'sender',
  senderId: 'sender',
  emails: 'recipients',
  subject: 'subject',
  delayBetweenMs: 'delay',
  hourlyLimit: 'hourlyLimit',
  body: 'body',
};

const isWholeNumber = (value: string, min: number) => /^\d+$/.test(value.trim()) && Number(value) >= min;

interface FormValues {
  recipients: string[];
  subject: string;
  delay: string;
  hourlyLimit: string;
  body: string;
}

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.recipients.length === 0) errors.recipients = 'Add at least one recipient, or upload a list';
  if (!values.subject.trim()) errors.subject = 'Subject is required';
  if (!isWholeNumber(values.delay, 0)) errors.delay = 'Seconds, 0 or more';
  if (!isWholeNumber(values.hourlyLimit, 1)) errors.hourlyLimit = '1 or more';
  if (!values.body.trim()) errors.body = 'Write a message';
  return errors;
}

function scheduledToast(result: ScheduleCampaignResult): string {
  const count = `${result.scheduledCount.toLocaleString()} ${result.scheduledCount === 1 ? 'email' : 'emails'}`;
  const when = new Date(result.firstSendAt).getTime() <= Date.now() + 60_000 ? 'starting now' : `starting ${formatDateTime(result.firstSendAt)}`;
  const queued = result.enqueued ? '' : ' The queue was unavailable, so sending starts when the worker restarts.';
  const from = result.senders.length > 1 ? `${result.senders.length} senders` : result.sender.email;
  return `Scheduled ${count} from ${from}, ${when}.${queued}`;
}

// Under the From pill: who the emails go out as, and how the hourly limit works with several senders.
function SenderHint({ senders }: { senders: Sender[] }) {
  const [first] = senders;
  if (!first) return null;
  const perSender = first.usage.hourlyLimit;
  return (
    <p className="mt-1.5 text-xs text-neutral-500">
      {senders.length === 1
        ? `Sends as “${first.name}” · ${first.usage.sentThisHour ?? '?'} / ${perSender} sent this hour`
        : `Recipients are split between ${senders.length} senders in turn · each sends up to ${perSender} per hour, ${(perSender * senders.length).toLocaleString()} per hour together`}
    </p>
  );
}

// Label on the left, control on the right, error underneath: one row of the compose form.
function Row({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[5rem_1fr] sm:items-start sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2.5 text-base text-neutral-900">
        {label}
      </label>
      <div className="min-w-0">
        {children}
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

const underlineInput = (invalid: boolean) =>
  cn(
    'w-full border-0 border-b bg-transparent px-0 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0',
    invalid ? 'border-red-300' : 'border-neutral-200 focus:border-brand-500',
  );
const boxInput = (invalid: boolean) =>
  cn(
    'h-12 w-20 rounded-lg border bg-white px-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500',
    invalid ? 'border-red-300' : 'border-neutral-200',
  );

export function ComposePage() {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const navigate = useNavigate();
  const toast = useToast();
  const senders = useSenders();
  const schedule = useScheduleCampaign();

  const [values, setValues] = useState<FormValues>({ recipients: [], subject: '', delay: '', hourlyLimit: '', body: '' });
  // Empty = not chosen yet, which means "the first sender".
  const [senderIds, setSenderIds] = useState<string[]>([]);
  const [addingSender, setAddingSender] = useState(false);
  const [sendAt, setSendAt] = useState<Date | null>(null);
  // Errors only show after the first send attempt, then update live as fields are fixed.
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const firstSenderId = senders.data?.[0]?.id;
  const selectedSenderIds = senderIds.length > 0 ? senderIds : firstSenderId ? [firstSenderId] : [];
  const selectedSenders = (senders.data ?? []).filter((sender) => selectedSenderIds.includes(sender.id));
  const errors: FieldErrors = { ...(submitted ? validate(values) : {}), ...serverErrors };

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Once the user edits a field, the server's old complaint about it no longer applies.
    setServerErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    if (Object.keys(validate(values)).length > 0) return;

    schedule.mutate(
      {
        subject: values.subject.trim(),
        body: values.body,
        emails: values.recipients,
        // No time chosen = start now (the API treats past/now as "start immediately").
        startTime: (sendAt ?? new Date()).toISOString(),
        delayBetweenMs: Number(values.delay) * 1000,
        hourlyLimit: Number(values.hourlyLimit),
        senderIds: selectedSenderIds,
      },
      {
        onSuccess: (result) => {
          toast('success', scheduledToast(result));
          navigate(tabPath('scheduled'));
        },
        onError: (err) => {
          // 400 with per-field messages: show each next to its input.
          if (err instanceof ApiError && err.fields) {
            const mapped: FieldErrors = {};
            for (const [field, messages] of Object.entries(err.fields)) {
              const name = SERVER_FIELD_TO_FORM[field];
              if (name && messages[0]) mapped[name] = messages[0];
            }
            setServerErrors(mapped);
            if (Object.keys(mapped).length > 0) return;
          }
          // Anything else (e.g. "3 invalid email address(es)…", network down) goes on top.
          setFormError(errorMessage(err));
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-2 px-4 py-4 sm:px-6">
        <IconButton label="Back to dashboard" onClick={() => navigate(-1)}>
          <ArrowLeftIcon className="size-6 text-neutral-800" />
        </IconButton>
        <h1 className="flex-1 text-2xl text-neutral-900 sm:text-3xl">Compose New Email</h1>
        <SendLaterPopover value={sendAt} onChange={setSendAt} />
        {/* Lives in the header, outside the <form>; form="..." still makes it submit it. */}
        <Button type="submit" form="compose-form" variant="outline" pill size="md" loading={schedule.isPending} className="px-8 text-base">
          {sendAt ? 'Send Later' : 'Send'}
        </Button>
      </header>

      {/* noValidate: we show our own messages instead of the browser's inconsistent bubbles. */}
      <form id="compose-form" onSubmit={onSubmit} noValidate className="mx-auto max-w-5xl space-y-5 px-4 pb-16 pt-4 sm:px-8">
        {sendAt && (
          <p className="flex items-center gap-2 text-sm text-brand-700">
            Sending starts {formatDateTime(sendAt.toISOString())}
            <button type="button" onClick={() => setSendAt(null)} aria-label="Send now instead" className="rounded-full p-0.5 hover:bg-brand-50">
              <XIcon className="size-4" />
            </button>
          </p>
        )}
        {formError && <Alert tone="error">{formError}</Alert>}

        <Row label="From" htmlFor={id('from')} error={errors.sender ?? (senders.isError ? errorMessage(senders.error) : undefined)}>
          <SenderPicker
            id={id('from')}
            senders={senders.data}
            selectedIds={selectedSenderIds}
            onChange={setSenderIds}
            onAddSender={() => setAddingSender(true)}
            disabled={senders.isPending || senders.isError}
          />
          {!addingSender && <SenderHint senders={selectedSenders} />}
          {addingSender && (
            <AddSenderPanel
              defaultName={`Ethereal sender ${(senders.data?.length ?? 0) + 1}`}
              onCreated={(sender) => {
                // Add the new sender to the selection rather than replacing it.
                setSenderIds([...selectedSenderIds, sender.id]);
                setAddingSender(false);
              }}
              onCancel={() => setAddingSender(false)}
            />
          )}
        </Row>

        {/* RecipientsInput shows its own error line, under the recipient count. */}
        <Row label="To" htmlFor={id('to')}>
          <RecipientsInput id={id('to')} emails={values.recipients} onChange={(emails) => update('recipients', emails)} error={errors.recipients} />
        </Row>

        <Row label="Subject" htmlFor={id('subject')} error={errors.subject}>
          <input
            id={id('subject')}
            value={values.subject}
            onChange={(event) => update('subject', event.target.value)}
            maxLength={MAX_SUBJECT_LENGTH}
            placeholder="Subject"
            aria-invalid={errors.subject ? true : undefined}
            className={underlineInput(Boolean(errors.subject))}
          />
        </Row>

        <div className="flex flex-wrap items-start gap-x-10 gap-y-4 pt-1">
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor={id('delay')} className="text-base text-neutral-900">
                Delay between 2 emails
              </label>
              <input
                id={id('delay')}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={values.delay}
                onChange={(event) => update('delay', event.target.value)}
                placeholder="00"
                aria-invalid={errors.delay ? true : undefined}
                className={boxInput(Boolean(errors.delay))}
              />
              <span className="text-sm text-neutral-500">sec</span>
            </div>
            {errors.delay && <p className="mt-1.5 text-xs text-red-600">{errors.delay}</p>}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor={id('hourly')} className="text-base text-neutral-900">
                Hourly Limit
              </label>
              <input
                id={id('hourly')}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.hourlyLimit}
                onChange={(event) => update('hourlyLimit', event.target.value)}
                placeholder="00"
                aria-invalid={errors.hourlyLimit ? true : undefined}
                className={boxInput(Boolean(errors.hourlyLimit))}
              />
              <span className="text-sm text-neutral-500">emails / hour</span>
            </div>
            {errors.hourlyLimit && <p className="mt-1.5 text-xs text-red-600">{errors.hourlyLimit}</p>}
          </div>
        </div>

        <div>
          <label htmlFor={id('body')} className="sr-only">
            Message
          </label>
          <textarea
            id={id('body')}
            value={values.body}
            onChange={(event) => update('body', event.target.value)}
            placeholder="Type your message…"
            aria-invalid={errors.body ? true : undefined}
            className={cn(
              'block min-h-[24rem] w-full resize-y rounded-2xl border-0 bg-neutral-50 p-5 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2',
              errors.body ? 'ring-2 ring-red-300' : 'focus:ring-brand-500',
            )}
          />
          {errors.body && <p className="mt-1.5 text-xs text-red-600">{errors.body}</p>}
        </div>
      </form>
    </div>
  );
}
