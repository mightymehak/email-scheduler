import { useEffect, useState } from 'react';

// Returns `value` only once it has stopped changing for `delayMs`, so typing "invoice"
// sends one search request instead of seven.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // A new keystroke cancels the pending update.
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
