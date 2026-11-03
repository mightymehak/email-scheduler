import { cn } from '../../lib/cn';
import { SearchIcon } from './icons';
import { Spinner } from './Spinner';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Spinner instead of the magnifier while results load.
  loading?: boolean;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search', loading = false, className }: SearchInputProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-neutral-400">
        {loading ? <Spinner className="size-4" /> : <SearchIcon className="size-4.5" />}
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-full border-0 bg-surface pl-11 pr-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
