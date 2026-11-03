import { IconButton } from './Button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Compact, inbox-style pager: "21–40 of 135  <  >".
export function Pagination({ page, pageSize, total, totalPages, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1 text-sm text-neutral-500">
      <span className="mr-1 whitespace-nowrap tabular-nums">
        {first}–{last} of {total.toLocaleString()}
      </span>
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="size-8">
        <ChevronLeftIcon className="size-4" />
      </IconButton>
      <IconButton label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="size-8">
        <ChevronRightIcon className="size-4" />
      </IconButton>
    </nav>
  );
}
