import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton, buttonClasses } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { RefreshIcon } from '../../components/ui/icons';
import { Pagination } from '../../components/ui/Pagination';
import { SearchInput } from '../../components/ui/SearchInput';
import { LoadingState } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { EmailStatus, EmailTab } from '../../lib/types';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useNow } from '../../lib/useNow';
import { EmailRowItem } from './EmailRowItem';
import { StatusFilter } from './StatusFilter';
import { emailKeys, useEmailList, useEmailSearch } from './useEmails';

const SEARCH_DEBOUNCE_MS = 300;
const RELATIVE_TIME_REFRESH_MS = 15_000;

const EMPTY_COPY: Record<EmailTab, { title: string; description: string }> = {
  scheduled: { title: 'No scheduled emails', description: 'Emails you schedule appear here until they are sent.' },
  sent: { title: 'No sent emails yet', description: 'Sent and failed emails appear here.' },
};

// One folder (Scheduled or Sent). The parent renders it with key={tab}, so switching folders
// starts with a fresh search, filter and page.
export function EmailsView({ tab }: { tab: EmailTab }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<EmailStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const isSearching = q.length > 0;
  const nowMs = useNow(RELATIVE_TIME_REFRESH_MS);

  const list = useEmailList(tab, status, page, !isSearching);
  const search = useEmailSearch(q, tab, status, page);
  const active = isSearching ? search : list;
  const data = active.data;

  // Rows can move to the other folder while you're on the last page (e.g. the last scheduled
  // email gets sent); step back instead of showing an empty page.
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages);
  }, [data, page]);

  // A manual refresh also updates the sidebar counts. Its own flag (not isFetching) so the
  // icon doesn't spin on every 5-second background poll.
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([active.refetch(), queryClient.invalidateQueries({ queryKey: emailKeys.stats })]);
    setRefreshing(false);
  };

  // Checked against `data` rather than isPending/isError: if a background refresh fails we keep
  // showing the rows we already have; the error screen only appears when there's nothing to show.
  let body: ReactNode;
  if (!data && active.isError) {
    body = (
      <Alert tone="error" className="m-4" action={<Button size="sm" variant="secondary" onClick={() => void active.refetch()}>Retry</Button>}>
        {errorMessage(active.error)}
      </Alert>
    );
  } else if (!data) {
    body = <LoadingState label={isSearching ? 'Searching…' : 'Loading emails…'} />;
  } else if (data.items.length === 0) {
    body =
      isSearching || status ? (
        <EmptyState title={`No ${tab} emails match`} description="Try another word, a recipient address, or clear the filter." />
      ) : (
        <EmptyState
          {...EMPTY_COPY[tab]}
          action={
            tab === 'scheduled' && (
              <Link to="/compose" className={buttonClasses({ variant: 'outline', pill: true })}>
                Compose
              </Link>
            )
          }
        />
      );
  } else {
    body = (
      // keepPreviousData: dimmed while the next page or search loads over the current rows.
      <ul className={cn('transition-opacity', active.isPlaceholderData && 'opacity-60')}>
        {data.items.map((email) => (
          <EmailRowItem key={email.id} email={email} tab={tab} nowMs={nowMs} />
        ))}
      </ul>
    );
  }

  return (
    <section aria-label={`${tab} emails`}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          loading={isSearching && search.isFetching && search.isPlaceholderData}
          className="min-w-0 flex-1 basis-64 lg:max-w-3xl"
        />
        <StatusFilter
          tab={tab}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
        <IconButton label="Refresh" onClick={() => void onRefresh()} disabled={refreshing}>
          <RefreshIcon className={cn(refreshing && 'animate-spin')} />
        </IconButton>
        {data && (
          <div className="ml-auto">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={data.totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
      {body}
    </section>
  );
}
