import { useCallback, useRef, useState } from 'react';
import { IconButton } from '../../components/ui/Button';
import { FilterIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import type { EmailStatus, EmailTab } from '../../lib/types';
import { useClickOutside } from '../../lib/useClickOutside';

// The statuses that can appear in each folder (same split as the backend's TAB_STATUSES).
const OPTIONS: Record<EmailTab, { value: EmailStatus; label: string }[]> = {
  scheduled: [
    { value: 'SCHEDULED', label: 'Waiting to send' },
    { value: 'PROCESSING', label: 'Sending now' },
  ],
  sent: [
    { value: 'SENT', label: 'Sent' },
    { value: 'FAILED', label: 'Failed' },
  ],
};

interface StatusFilterProps {
  tab: EmailTab;
  value: EmailStatus | undefined;
  onChange: (status: EmailStatus | undefined) => void;
}

// The funnel icon: narrows the open folder to one status. Green while a filter is active.
export function StatusFilter({ tab, value, onChange }: StatusFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const choose = (status: EmailStatus | undefined) => {
    onChange(status);
    setOpen(false);
  };
  const options = [{ value: undefined, label: 'All' }, ...OPTIONS[tab]];

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={value ? 'Filter (active)' : 'Filter'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(value && 'bg-brand-50 text-brand-600 hover:bg-brand-100 hover:text-brand-700')}
      >
        <FilterIcon />
      </IconButton>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => choose(option.value)}
              className={cn(
                'block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-50',
                value === option.value ? 'font-medium text-brand-700' : 'text-neutral-700',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
