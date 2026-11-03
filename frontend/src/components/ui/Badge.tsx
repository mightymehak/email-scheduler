import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'orange' | 'blue' | 'green' | 'red';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-brand-50 text-brand-700 ring-brand-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}

// Rounded pill: the scheduled-time and "Sent" labels in the email rows.
export function Badge({ tone = 'neutral', children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
