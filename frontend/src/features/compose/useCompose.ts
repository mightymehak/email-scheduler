import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { ScheduleCampaignInput, ScheduleCampaignResult, Sender } from '../../lib/types';
import { emailKeys } from '../emails/useEmails';

export const SENDERS_KEY = ['senders'] as const;

export function useSenders() {
  return useQuery({
    queryKey: SENDERS_KEY,
    queryFn: ({ signal }) => apiFetch<{ items: Sender[] }>('/api/senders', { signal }).then((res) => res.items),
  });
}

// name = display name in the From header. email + password = an existing Ethereal account;
// without them the API generates a brand-new Ethereal account.
export interface CreateSenderInput {
  name: string;
  email?: string;
  password?: string;
}

// Adds another sender, with its own hourly limit and send gap.
export function useCreateSender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSenderInput) =>
      apiFetch<{ sender: Omit<Sender, 'usage'> }>('/api/senders', { method: 'POST', body: input }).then((res) => res.sender),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SENDERS_KEY }),
  });
}

export function useScheduleCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleCampaignInput) =>
      apiFetch<ScheduleCampaignResult>('/api/campaigns/schedule', { method: 'POST', body: input }),
    onSuccess: () => {
      // The new emails should appear in the tables, stats and search right away.
      void queryClient.invalidateQueries({ queryKey: emailKeys.all });
      void queryClient.invalidateQueries({ queryKey: SENDERS_KEY });
    },
  });
}
