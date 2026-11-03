import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, string> = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  success: 'bg-brand-50 text-brand-700 ring-brand-200',
  info: 'bg-neutral-50 text-neutral-800 ring-neutral-200',
};

interface AlertProps {
  tone?: Tone;
  children: ReactNode;
  // Optional right-hand action, e.g. a "Retry" or "Dismiss" button.
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', children, action, className }: AlertProps) {
  return (
    // role="alert" makes screen readers announce errors as soon as they appear.
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm ring-1 ring-inset', TONES[tone], className)}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
