// Joins class names and drops falsy ones: cn('btn', isActive && 'btn-active').
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
