import { useSearchParams } from 'react-router';
import type { EmailTab } from '../../lib/types';

// The open folder lives in the URL (/dashboard?tab=sent), so a refresh or a shared link opens
// the same folder, and the sidebar and the list read it from one place.
export function useTabParam(): EmailTab {
  const [params] = useSearchParams();
  return params.get('tab') === 'sent' ? 'sent' : 'scheduled';
}

export const tabPath = (tab: EmailTab) => `/dashboard?tab=${tab}`;
