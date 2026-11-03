import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type IconProps = { className?: string };

// Outline icons on a 24x24 grid, drawn with the current text colour. Each is decorative
// (aria-hidden): the button or link around it carries the accessible label.
function createIcon(paths: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('size-5 shrink-0', className)}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

export const ClockIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const SendIcon = createIcon(<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" />);
export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const FilterIcon = createIcon(<path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z" />);
export const RefreshIcon = createIcon(
  <>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </>,
);
export const ChevronDownIcon = createIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronLeftIcon = createIcon(<path d="m15 6-6 6 6 6" />);
export const ChevronRightIcon = createIcon(<path d="m9 6 6 6-6 6" />);
export const ArrowLeftIcon = createIcon(<path d="M20 12H4m6-6-6 6 6 6" />);
export const UploadIcon = createIcon(<path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />);
export const XIcon = createIcon(<path d="M6 6l12 12M18 6 6 18" />);
export const BellIcon = createIcon(<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0" />);
export const LogOutIcon = createIcon(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />);
export const HourglassIcon = createIcon(<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />);
export const ExternalLinkIcon = createIcon(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />);
export const PlusIcon = createIcon(<path d="M12 5v14M5 12h14" />);
