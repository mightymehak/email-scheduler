import { useCallback, useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import type { Sender } from '../../lib/types';
import { useClickOutside } from '../../lib/useClickOutside';

interface SenderPickerProps {
  id: string;
  senders: Sender[] | undefined;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAddSender: () => void;
  disabled?: boolean;
}

// The "From" pill. Ticking several senders splits the campaign's recipients between them; each
// sender keeps its own hourly limit, so more senders means more emails per hour.
export function SenderPicker({ id, senders, selectedIds, onChange, onAddSender, disabled = false }: SenderPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const selected = (senders ?? []).filter((sender) => selectedIds.includes(sender.id));
  const toggle = (senderId: string) => {
    if (!selectedIds.includes(senderId)) onChange([...selectedIds, senderId]);
    // At least one sender must stay selected.
    else if (selectedIds.length > 1) onChange(selectedIds.filter((existing) => existing !== senderId));
  };

  let label = 'Loading senders…';
  if (senders && selected.length === 0) label = 'Choose a sender';
  if (selected[0]) label = selected[0].email;

  return (
    <div ref={ref} className="relative inline-block max-w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface py-2.5 pl-3 pr-3 text-base text-neutral-900 transition-colors hover:bg-neutral-200/60 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
      >
        <span className="truncate">{label}</span>
        {selected.length > 1 && (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-sm text-brand-700 ring-1 ring-inset ring-brand-500">
            +{selected.length - 1}
          </span>
        )}
        <ChevronDownIcon className={cn('size-4 shrink-0 text-neutral-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && senders && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-1 shadow-xl">
          <p className="px-3 pb-1 pt-2 text-xs text-neutral-500">Tick several senders to split the recipients between them.</p>
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto">
            {senders.map((sender) => {
              const checked = selectedIds.includes(sender.id);
              const { sentThisHour, hourlyLimit } = sender.usage;
              return (
                <li key={sender.id} role="option" aria-selected={checked}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      // The last selected sender can't be unticked.
                      disabled={checked && selectedIds.length === 1}
                      onChange={() => toggle(sender.id)}
                      className="mt-1 size-4 accent-brand-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-900">{sender.email}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        “{sender.name}” · {sentThisHour ?? '?'} / {hourlyLimit} sent this hour
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddSender();
            }}
            className="flex w-full items-center gap-2 rounded-lg border-t border-neutral-100 px-3 py-2.5 text-left text-sm text-brand-600 hover:bg-neutral-50"
          >
            <PlusIcon className="size-4" />
            Add new sender
          </button>
        </div>
      )}
    </div>
  );
}
