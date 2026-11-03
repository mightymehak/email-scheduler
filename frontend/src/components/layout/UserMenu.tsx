import { useCallback, useRef, useState } from 'react';
import { useCurrentUser, useLogout } from '../../features/auth/useAuth';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useClickOutside } from '../../lib/useClickOutside';
import { Avatar } from '../ui/Avatar';
import { ChevronDownIcon, LogOutIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../ui/Toast';

// The grey user card at the top of the sidebar; the chevron opens a menu with Log out.
export function UserMenu() {
  // Already cached by ProtectedRoute, so this doesn't make another request.
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-left transition-colors hover:bg-neutral-200/60"
      >
        <Avatar name={user.name} src={user.avatarUrl} className="size-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-neutral-900">{user.name}</span>
          <span className="block truncate text-xs text-neutral-500">{user.email}</span>
        </span>
        <ChevronDownIcon className={cn('size-4 text-neutral-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onError: (err) => toast('error', errorMessage(err)) })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            {logout.isPending ? <Spinner className="size-4" /> : <LogOutIcon className="size-4" />}
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
