import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js';

// Query-string pagination shared by every list endpoint (?page=2&pageSize=50).
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, pageSize }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPage<T>(items: T[], total: number, { page, pageSize }: Pagination): Page<T> {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
