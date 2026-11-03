import { Link } from 'react-router';

// Pixel-font wordmark, as in the design.
export function Logo() {
  return (
    <Link to="/dashboard" className="inline-block font-logo text-4xl leading-none tracking-tight text-neutral-950" aria-label="ONB home">
      ONB
    </Link>
  );
}
