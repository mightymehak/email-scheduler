import { useState } from 'react';
import { cn } from '../../lib/cn';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

// Google profile photo, falling back to initials if there is none or it fails to load.
export function Avatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const base = cn('size-9 shrink-0 rounded-full', className);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={cn(base, 'object-cover')}
        // Google's avatar CDN can reject requests that carry a Referer from localhost.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span aria-hidden="true" className={cn(base, 'grid place-items-center bg-brand-500 text-sm font-semibold text-white')}>
      {initials(name)}
    </span>
  );
}
