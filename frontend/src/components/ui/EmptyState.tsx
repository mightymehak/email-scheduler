import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  // Optional call to action, e.g. a "Compose" button.
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <svg viewBox="0 0 24 24" className="size-10 text-neutral-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path strokeLinejoin="round" d="M3 7.5 12 13l9-5.5M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6Z" />
      </svg>
      <p className="mt-4 text-sm font-medium text-neutral-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
