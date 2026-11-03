import { Navigate, Outlet } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/api';
import { useCurrentUser } from './useAuth';

// Shown when we can't tell whether the user is logged in (e.g. the API is down).
function SessionCheckFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}>
        {errorMessage(error)}
      </Alert>
    </div>
  );
}

// Pages for logged-in users only. While /auth/me is loading we show a spinner rather than
// redirecting, otherwise a logged-in user would flash to /login on every page refresh.
export function ProtectedRoute() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  if (isPending) return <LoadingState label="Checking your session…" className="min-h-screen" />;
  if (isError) return <SessionCheckFailed error={error} onRetry={() => void refetch()} />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// The login page: a user who is already logged in goes straight to the dashboard.
export function GuestRoute() {
  const { data: user, isPending, isError } = useCurrentUser();
  if (isPending) return <LoadingState className="min-h-screen" />;
  // If the session check failed, still show the login page: logging in is the way forward.
  if (user && !isError) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
