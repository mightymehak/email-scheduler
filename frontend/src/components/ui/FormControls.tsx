import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// One look for every input type; a red ring when the field has an error.
function inputClasses(invalid: boolean, className?: string): string {
  return cn(
    'block w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm text-neutral-900 ring-1 ring-inset placeholder:text-neutral-400',
    'focus:bg-white focus:outline-none focus:ring-2 disabled:text-neutral-500',
    invalid ? 'ring-red-300 focus:ring-red-500' : 'ring-transparent focus:ring-brand-500',
    className,
  );
}

interface FieldProps {
  // Must match the control's id, so clicking the label focuses the control.
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  // Content on the right of the label row, e.g. an "Add sender" link.
  labelAction?: ReactNode;
  children: ReactNode;
}

// Label + control + hint/error. The error replaces the hint so the field doesn't jump in height.
export function Field({ id, label, hint, error, labelAction, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-neutral-800">
          {label}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      )}
    </div>
  );
}

// aria-invalid/aria-describedby let screen readers announce the field's error.
const errorAria = (id: string | undefined, error: string | undefined) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error && id ? `${id}-error` : undefined,
});

type WithError = { error?: string };

export function TextInput({ error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & WithError) {
  return <input className={inputClasses(Boolean(error), className)} {...errorAria(rest.id, error)} {...rest} />;
}

export function Textarea({ error, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & WithError) {
  return <textarea className={inputClasses(Boolean(error), className)} {...errorAria(rest.id, error)} {...rest} />;
}

export function Select({ error, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & WithError) {
  return <select className={inputClasses(Boolean(error), cn('pr-8', className))} {...errorAria(rest.id, error)} {...rest} />;
}
