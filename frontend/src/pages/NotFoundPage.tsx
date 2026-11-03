import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold text-neutral-900">Page not found</h1>
      <Link to="/dashboard" className={buttonClasses({ variant: 'outline', pill: true })}>
        Go to dashboard
      </Link>
    </div>
  );
}
