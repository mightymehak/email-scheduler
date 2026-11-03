export interface ParsedLeads {
  // Unique, lower-cased, valid addresses in first-seen order: what gets scheduled.
  emails: string[];
  duplicates: number;
  // Tokens that contain "@" but aren't valid addresses, shown so the user can fix them.
  invalid: string[];
}

// Pragmatic check (something@something.tld). The backend validates again with zod, so this
// only needs to catch obvious mistakes before upload.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts a CSV, a plain list, or pasted text in any layout. Instead of assuming a column, it
// splits on separators (commas, semicolons, tabs, whitespace, quotes, angle brackets) and keeps
// every token containing "@". So "name,email" headers, names and "Alice <a@x.com>" all work.
export function parseLeads(text: string): ParsedLeads {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const token of text.split(/[\s,;"'<>()[\]]+/)) {
    if (!token.includes('@')) continue;
    // Addresses are case-insensitive in practice; the backend lower-cases them too.
    const email = token.toLowerCase().replace(/^mailto:/, '').replace(/[.:]+$/, '');
    if (!EMAIL_PATTERN.test(email)) invalid.push(token);
    else if (seen.has(email)) duplicates++;
    else {
      seen.add(email);
      emails.push(email);
    }
  }
  return { emails, duplicates, invalid };
}
