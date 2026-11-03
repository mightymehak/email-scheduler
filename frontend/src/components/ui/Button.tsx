import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'soft' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Solid green: the main action on a page (e.g. Login).
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  // Green outline: Compose, Send, Done.
  outline: 'bg-white text-brand-600 ring-1 ring-inset ring-brand-500 hover:bg-brand-50',
  // Pale green fill: "Login with Google".
  soft: 'bg-brand-50 text-neutral-900 hover:bg-brand-100',
  secondary: 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

interface ButtonStyle {
  variant?: Variant;
  size?: Size;
  // Fully rounded ends, like the design's Compose and Send buttons.
  pill?: boolean;
  className?: string;
}

// Exported separately so links that look like buttons (e.g. "Login with Google", which is a
// full-page navigation, not a click handler) share exactly the same styles.
export function buttonClasses({ variant = 'primary', size = 'md', pill = false, className }: ButtonStyle = {}): string {
  return cn(
    'inline-flex items-center justify-center font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    'disabled:cursor-not-allowed disabled:opacity-60',
    pill ? 'rounded-full' : 'rounded-lg',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonStyle, 'className'> {
  // Shows a spinner and disables the button, so a slow request can't be submitted twice.
  loading?: boolean;
}

export function Button({ variant, size, pill, loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClasses({ variant, size, pill, className })} {...rest}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

// Square, borderless icon button (filter, refresh, back arrow). `label` is required because the
// icon alone says nothing to a screen reader.
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
