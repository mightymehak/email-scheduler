import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';
import type { SlackStatus } from '../../lib/types';

export const SLACK_STATUS_KEY = ['slack', 'status'] as const;

// Full-page navigation: the API (which reads our session cookie) redirects to Slack's consent
// screen; Slack returns to the API, which redirects back to /dashboard?slack=connected|error.
export const SLACK_CONNECT_URL = `${API_URL}/api/slack/connect`;

export function useSlackStatus() {
  return useQuery({
    queryKey: SLACK_STATUS_KEY,
    queryFn: ({ signal }) => apiFetch<SlackStatus>('/api/slack/status', { signal }),
  });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/slack', { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData<SlackStatus>(SLACK_STATUS_KEY, { connected: false }),
  });
}

export function useSendSlackTest() {
  return useMutation({
    mutationFn: () => apiFetch<{ sent: boolean }>('/api/slack/test', { method: 'POST' }),
  });
}
