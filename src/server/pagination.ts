import { ValidationError } from "@/lib/app-errors";
import { MAX_OFFSET, type OffsetPage } from "./types";

/** Shared paging policy for per-student lists (mistakes, bookmarks, reports). */
export const PAGE_DEFAULT_LIMIT = 20;
export const PAGE_MAX_LIMIT = 50;

export function offsetBounds(request: { limit?: number; offset?: number }): {
  offset: number;
  limit: number;
} {
  const offset = request.offset ?? 0;
  if (offset < 0 || offset > MAX_OFFSET) throw new ValidationError("That page is out of range.");
  const limit = Math.min(Math.max(request.limit ?? PAGE_DEFAULT_LIMIT, 1), PAGE_MAX_LIMIT);
  return { offset, limit };
}

/** Repositories are asked for `limit + 1` rows; the extra one only signals that a next page exists. */
export function toOffsetPage<T>(rows: T[], limit: number, offset: number): OffsetPage<T> {
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}
