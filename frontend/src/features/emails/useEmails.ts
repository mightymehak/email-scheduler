import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { EmailDetail, EmailListItem, EmailStats, EmailStatus, EmailTab, Page, SearchHit } from '../../lib/types';

// Every email query key starts with 'emails', so one invalidateQueries({ queryKey: ['emails'] })
// (e.g. after scheduling a campaign) refreshes the lists, counts, search and detail together.
export const emailKeys = {
  all: ['emails'] as const,
  list: (tab: EmailTab, status: EmailStatus | undefined, page: number) => ['emails', 'list', tab, status, page] as const,
  search: (q: string, tab: EmailTab, status: EmailStatus | undefined, page: number) =>
    ['emails', 'search', tab, status, q, page] as const,
  stats: ['emails', 'stats'] as const,
  detail: (id: string) => ['emails', 'detail', id] as const,
};

// Polling keeps the dashboard live: emails move from Scheduled to Sent as the worker sends them.
// React Query pauses polling while the browser tab is hidden.
const LIVE_REFRESH_MS = 5_000;
export const PAGE_SIZE = 20;

function listParams(tab: EmailTab, status: EmailStatus | undefined, page: number): URLSearchParams {
  return new URLSearchParams({ tab, page: String(page), pageSize: String(PAGE_SIZE), ...(status ? { status } : {}) });
}

export function useEmailList(tab: EmailTab, status: EmailStatus | undefined, page: number, enabled: boolean) {
  return useQuery({
    queryKey: emailKeys.list(tab, status, page),
    queryFn: ({ signal }) => apiFetch<Page<EmailListItem>>(`/api/emails?${listParams(tab, status, page)}`, { signal }),
    enabled,
    refetchInterval: LIVE_REFRESH_MS,
    // Keep showing the current page while the next one loads, instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useEmailSearch(q: string, tab: EmailTab, status: EmailStatus | undefined, page: number) {
  return useQuery({
    queryKey: emailKeys.search(q, tab, status, page),
    queryFn: ({ signal }) => {
      const params = listParams(tab, status, page);
      params.set('q', q);
      return apiFetch<Page<SearchHit>>(`/api/emails/search?${params}`, { signal });
    },
    enabled: q.length > 0,
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useEmailStats() {
  return useQuery({
    queryKey: emailKeys.stats,
    queryFn: ({ signal }) => apiFetch<EmailStats>('/api/emails/stats', { signal }),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmailDetail(id: string) {
  return useQuery({
    queryKey: emailKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<{ email: EmailDetail }>(`/api/emails/${encodeURIComponent(id)}`, { signal }).then((res) => res.email),
    // A scheduled email can be sent while you look at it.
    refetchInterval: LIVE_REFRESH_MS,
  });
}
