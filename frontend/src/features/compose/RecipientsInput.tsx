import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { UploadIcon, XIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import { parseLeads } from './parseLeads';

// The API accepts JSON bodies up to 5 MB; a lead file larger than this can't be sent anyway.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// Chips shown before collapsing into "+N" (as in the design), and the cap when expanded so a
// 10,000-lead list doesn't render 10,000 chips.
const COLLAPSED_CHIPS = 3;
const EXPANDED_CHIPS = 200;

interface UploadSummary {
  fileName: string;
  found: number;
  duplicates: number;
  invalid: number;
}

interface RecipientsInputProps {
  id: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  error?: string;
}

// Adds new addresses to the list, skipping ones already there. Returns how many were duplicates.
function merge(current: string[], incoming: string[]): { emails: string[]; duplicates: number } {
  const seen = new Set(current);
  const added: string[] = [];
  for (const email of incoming) {
    if (seen.has(email)) continue;
    seen.add(email);
    added.push(email);
  }
  return { emails: [...current, ...added], duplicates: incoming.length - added.length };
}

// The "To" row: chips for each address, a text box for typing/pasting more, and "Upload List"
// for a CSV/TXT file. The parent only sees the final list of unique, valid addresses.
export function RecipientsInput({ id, emails, onChange, error }: RecipientsInputProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [upload, setUpload] = useState<UploadSummary | null>(null);

  // Turns typed/pasted text into chips. Anything that isn't a valid address stays in the box.
  const commit = (text: string) => {
    if (!text.trim()) return;
    const parsed = parseLeads(text);
    onChange(merge(emails, parsed.emails).emails);
    setDraft(parsed.invalid.join(' '));
    setDraftError(parsed.invalid.length > 0 ? `Not a valid email address: ${parsed.invalid[0]}` : null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter, comma and space finish an address; Enter must not submit the whole form.
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      commit(draft);
    }
    // Backspace in an empty box removes the last chip, like most email clients.
    if (event.key === 'Backspace' && !draft && emails.length > 0) onChange(emails.slice(0, -1));
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    commit(draft + ' ' + event.clipboardData.getData('text'));
  };

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so choosing the same file again still fires onChange.
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setDraftError(`${file.name} is larger than 4 MB.`);
      return;
    }
    const parsed = parseLeads(await file.text());
    const merged = merge(emails, parsed.emails);
    onChange(merged.emails);
    setDraftError(null);
    setUpload({
      fileName: file.name,
      found: parsed.emails.length,
      duplicates: parsed.duplicates + merged.duplicates,
      invalid: parsed.invalid.length,
    });
  };

  const visible = expanded ? emails.slice(0, EXPANDED_CHIPS) : emails.slice(0, COLLAPSED_CHIPS);
  const hidden = emails.length - visible.length;
  const shownError = draftError ?? error;

  return (
    <div>
      <div className={cn('flex flex-wrap items-center gap-2 border-b py-2', shownError ? 'border-red-300' : 'border-neutral-200')}>
        {visible.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-3 pr-1.5 text-sm text-neutral-800 ring-1 ring-inset ring-brand-500">
            {email}
            <button type="button" onClick={() => onChange(emails.filter((e) => e !== email))} aria-label={`Remove ${email}`} className="rounded-full p-0.5 text-neutral-500 hover:bg-brand-100">
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full bg-brand-50 px-3 py-0.5 text-sm text-neutral-800 ring-1 ring-inset ring-brand-500 hover:bg-brand-100"
            aria-label={expanded ? 'Show fewer recipients' : `Show ${hidden} more recipients`}
          >
            +{hidden.toLocaleString()}
          </button>
        )}
        {expanded && emails.length > COLLAPSED_CHIPS && hidden === 0 && (
          <button type="button" onClick={() => setExpanded(false)} className="text-sm text-neutral-500 hover:text-neutral-800">
            Show less
          </button>
        )}

        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDraftError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          placeholder={emails.length === 0 ? 'recipient@example.com' : ''}
          aria-invalid={shownError ? true : undefined}
          className="min-w-48 flex-1 border-0 bg-transparent py-1 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />

        <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFileSelected} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="ml-auto inline-flex items-center gap-2 py-1 text-base text-brand-600 hover:text-brand-700"
        >
          <UploadIcon className="size-4.5" />
          Upload List
        </button>
      </div>

      <p className={cn('mt-1.5 text-xs', shownError ? 'text-red-600' : 'text-neutral-500')} aria-live="polite">
        {shownError ?? (
          <>
            <span className="font-medium text-neutral-700">{emails.length.toLocaleString()}</span>{' '}
            {emails.length === 1 ? 'recipient' : 'recipients'}
            {upload && (
              <>
                {' '}· {upload.fileName}: {upload.found.toLocaleString()} {upload.found === 1 ? 'address' : 'addresses'} detected
                {upload.duplicates > 0 && `, ${upload.duplicates.toLocaleString()} ${upload.duplicates === 1 ? 'duplicate' : 'duplicates'} removed`}
                {upload.invalid > 0 && `, ${upload.invalid.toLocaleString()} invalid skipped`}
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
