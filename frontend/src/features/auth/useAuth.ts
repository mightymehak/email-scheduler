import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';
import type { User } from '../../lib/types';

export const CURRENT_USER_KEY = ['auth', 'me'] as const;

// A full-page navigation (not fetch): the API redirects to Google's consent screen, Google
// redirects back to the API, and the API sets the session cookie and redirects to /dashboard.
export const GOOGLE_LOGIN_URL = `${API_URL}/auth/google`;

// null = not logged in. A 401 is an expected answer here, not an error, so it's returned as
// data; anything else (API down, 500) stays an error so the UI can offer a retry.
async function fetchCurrentUser(signal: AbortSignal): Promise<User | null> {
  try {
    const { user } = await apiFetch<{ user: User }>('/auth/me', { signal });
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    // The session lasts days; no need to re-check on every window focus.
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Update the current-user query IN PLACE. Removing it instead would detach the components
      // still subscribed to it, so they'd never see the logout until a page refresh.
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      // Drop every other cached response, so the next user never sees this user's data.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== CURRENT_USER_KEY[0] });
      navigate('/login', { replace: true });
    },
  });
}
