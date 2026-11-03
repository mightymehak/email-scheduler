import { useEffect, type RefObject } from 'react';

// Closes popovers and menus: calls onClose on a mousedown outside `ref`, or on Escape.
// Only listens while `active`, so closed menus cost nothing.
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, active]);
}
