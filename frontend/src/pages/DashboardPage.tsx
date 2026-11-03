import { EmailsView } from '../features/emails/EmailsView';
import { useTabParam } from '../features/emails/useTabParam';

export function DashboardPage() {
  const tab = useTabParam();
  // key={tab}: switching folders resets the search, filter and page instead of carrying them over.
  return <EmailsView key={tab} tab={tab} />;
}
