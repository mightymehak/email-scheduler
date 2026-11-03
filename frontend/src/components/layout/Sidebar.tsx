import { Link, useLocation } from 'react-router';
import { tabPath, useTabParam } from '../../features/emails/useTabParam';
import { useEmailStats } from '../../features/emails/useEmails';
import { SlackCard } from '../../features/slack/SlackCard';
import { cn } from '../../lib/cn';
import type { EmailTab } from '../../lib/types';
import { buttonClasses } from '../ui/Button';
import { ClockIcon, SendIcon } from '../ui/icons';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';

const FOLDERS: { tab: EmailTab; label: string; Icon: typeof ClockIcon }[] = [
  { tab: 'scheduled', label: 'Scheduled', Icon: ClockIcon },
  { tab: 'sent', label: 'Sent', Icon: SendIcon },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const currentTab = useTabParam();
  const { data: stats } = useEmailStats();
  // Sending (PROCESSING) emails are still waiting from the user's point of view; failed ones are finished.
  const counts: Record<EmailTab, number | undefined> = {
    scheduled: stats && stats.scheduled + stats.processing,
    sent: stats && stats.sent + stats.failed,
  };

  return (
    <aside className="flex flex-col gap-5 px-5 py-6 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:shrink-0 lg:overflow-y-auto">
      <div className="px-1">
        <Logo />
      </div>
      <UserMenu />
      <Link to="/compose" className={buttonClasses({ variant: 'outline', pill: true, size: 'md', className: 'w-full text-base' })}>
        Compose
      </Link>

      <nav aria-label="Folders">
        <p className="px-5 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Core</p>
        <ul className="space-y-1">
          {FOLDERS.map(({ tab, label, Icon }) => {
            const active = pathname === '/dashboard' && currentTab === tab;
            return (
              <li key={tab}>
                <Link
                  to={tabPath(tab)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-5 py-2.5 text-base transition-colors',
                    active ? 'bg-brand-50 font-semibold text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50',
                  )}
                >
                  <Icon className="size-5 text-neutral-700" />
                  <span className="flex-1">{label}</span>
                  <span className="text-sm font-normal tabular-nums text-neutral-500">{counts[tab]?.toLocaleString()}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Not in the design: the assignment needs a "Connect Slack" control on the dashboard. */}
      <div className="lg:mt-auto">
        <SlackCard />
      </div>
    </aside>
  );
}
