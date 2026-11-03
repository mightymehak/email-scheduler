import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { XIcon } from './icons';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const TOAST_DURATION_MS = 5_000;

const TONES: Record<ToastTone, string> = {
  success: 'border-brand-200 bg-brand-50 text-brand-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-neutral-200 bg-white text-neutral-800',
};

type ShowToast = (tone: ToastTone, text: string) => void;
const ToastContext = createContext<ShowToast | null>(null);

// Short-lived messages ("Scheduled 25 emails", "Slack connected") in the bottom-right corner.
// Any component calls useToast()('success', '...'); the provider renders the stack.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback<ShowToast>(
    (tone, text) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, tone, text }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={useMemo(() => show, [show])}>
      {children}
      {/* aria-live: screen readers announce each new toast without moving focus. */}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg', TONES[toast.tone])}
          >
            <p className="flex-1">{toast.text}</p>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <XIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
