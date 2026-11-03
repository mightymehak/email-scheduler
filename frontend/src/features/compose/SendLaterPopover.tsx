import { useCallback, useRef, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { ClockIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import { useClickOutside } from '../../lib/useClickOutside';

// datetime-local wants local time without a timezone; toISOString() would give UTC.
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tomorrowAt(hour: number | null): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  // null = "Tomorrow": same time of day as now.
  if (hour !== null) date.setHours(hour, 0, 0, 0);
  return date;
}

const PRESETS: { label: string; hour: number | null }[] = [
  { label: 'Tomorrow', hour: null },
  { label: 'Tomorrow, 10:00 AM', hour: 10 },
  { label: 'Tomorrow, 11:00 AM', hour: 11 },
  { label: 'Tomorrow, 3:00 PM', hour: 15 },
];

interface SendLaterPopoverProps {
  // The chosen start time, or null for "send now".
  value: Date | null;
  onChange: (value: Date | null) => void;
}

// The clock icon in the Compose header: pick when sending starts. Nothing changes until Done.
export function SendLaterPopover({ value, onChange }: SendLaterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const toggle = () => {
    // Start from the current choice each time it opens.
    setDraft(value ? toLocalInputValue(value) : '');
    setError(null);
    setOpen((current) => !current);
  };

  const onDone = () => {
    // new Date("2026-11-04T10:00") is parsed as LOCAL time, which is what the user picked.
    const picked = new Date(draft);
    if (!draft || Number.isNaN(picked.getTime())) return setError('Pick a date and time');
    if (picked.getTime() <= Date.now()) return setError('Pick a time in the future');
    onChange(picked);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={value ? 'Change send time' : 'Send later'}
        aria-expanded={open}
        onClick={toggle}
        className={cn(value && 'text-brand-600 hover:text-brand-700')}
      >
        <ClockIcon className="size-6" />
      </IconButton>

      {open && (
        <div role="dialog" aria-label="Send later" className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
          <p className="text-lg text-neutral-900">Send Later</p>
          <input
            type="datetime-local"
            value={draft}
            min={toLocalInputValue(new Date())}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            aria-label="Pick date & time"
            className="mt-4 w-full border-0 border-b border-neutral-200 bg-transparent px-0 py-2 text-neutral-800 focus:border-brand-500 focus:outline-none focus:ring-0"
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

          <ul className="mt-3">
            {PRESETS.map((preset) => {
              const presetValue = toLocalInputValue(tomorrowAt(preset.hour));
              return (
                <li key={preset.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(presetValue);
                      setError(null);
                    }}
                    className={cn(
                      '-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2.5 text-left text-neutral-700 hover:bg-neutral-50',
                      draft === presetValue && 'bg-brand-50 text-brand-700',
                    )}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-center justify-end gap-3">
            {value && (
              <button
                type="button"
                className="mr-auto text-sm text-neutral-500 hover:text-neutral-800"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Send now instead
              </button>
            )}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="outline" pill onClick={onDone} className="px-8">
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
