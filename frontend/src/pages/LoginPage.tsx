import { useSearchParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { buttonClasses } from '../components/ui/Button';
import { GOOGLE_LOGIN_URL } from '../features/auth/useAuth';

// The API redirects here with ?error=<code> when Google login fails (see backend auth.routes.ts).
const LOGIN_ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Your sign-in attempt expired. Please try again.',
};
const DEFAULT_LOGIN_ERROR = 'Google sign-in failed. Please try again.';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const errorCode = params.get('error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-200 px-6 py-12 sm:px-16">
        <h1 className="text-center text-4xl font-semibold tracking-tight text-neutral-900">Login</h1>

        {errorCode && (
          <Alert tone="error" className="mt-8">
            {LOGIN_ERRORS[errorCode] ?? DEFAULT_LOGIN_ERROR}
          </Alert>
        )}

        {/* A link, not a fetch: OAuth needs a full-page redirect to Google and back. */}
        <a href={GOOGLE_LOGIN_URL} className={buttonClasses({ variant: 'soft', size: 'lg', className: 'mt-8 w-full gap-3 font-normal' })}>
          <GoogleIcon />
          Login with Google
        </a>

        {/* The design also shows an email/password form; this app signs in with Google only
            (the assignment requires real Google OAuth), so a non-working form is left out. */}
        <p className="mt-6 text-center text-sm text-neutral-400">Sign in with your Google account to schedule and track emails.</p>
      </div>
    </div>
  );
}
