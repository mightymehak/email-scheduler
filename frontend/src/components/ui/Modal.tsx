import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  // false while something is saving, so Esc / backdrop / × can't close the modal mid-request.
  dismissible?: boolean;
  // md for short confirmations, lg for forms.
  size?: 'md' | 'lg';
}

const SIZES = { md: 'max-w-md', lg: 'max-w-2xl' } as const;

// Built on the native <dialog>: showModal() gives us the backdrop, focus trapping, Esc to close
// and inert background content from the browser, with no extra library.
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, size = 'lg' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Keep the dialog in sync with the `open` prop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Stop the page behind the modal from scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      // Esc fires 'cancel'; we decide whether to close, the parent owns the open state.
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      // A click on the <dialog> element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
      className={cn('m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-xl backdrop:bg-neutral-900/50', SIZES[size])}
    >
      {/* Only render the content while open, so the form resets every time the modal opens. */}
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-neutral-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          {/* Only the body scrolls; header and footer stay visible on small screens. */}
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
