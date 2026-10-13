import { useState } from "react";
import { toast } from "sonner";
import { useServerData, type ServerData } from "./use-server-data";

interface Page<T> {
  readonly items: readonly T[];
  readonly nextOffset: number | null;
}

export interface PagedList<T> {
  /** The first page's request, for its loading and error state and a retry. */
  readonly first: ServerData<Page<T>>;
  /** Every item loaded so far, in the order the server gave them. */
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => Promise<void>;
}

/**
 * A list the server hands out a page at a time. The first page loads (again) whenever `deps` change and
 * resets what was loaded after it; "load more" asks for the next offset the server named, and a failure
 * is shown as a message without losing the items already on screen.
 */
export function usePagedList<T>(
  fetchPage: (offset: number | undefined) => Promise<Page<T>>,
  deps: readonly unknown[],
): PagedList<T> {
  const [extra, setExtra] = useState<readonly T[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useServerData(async () => {
    const page = await fetchPage(undefined);
    setExtra([]);
    setNext(page.nextOffset);
    return page;
  }, deps);

  const loadMore = async () => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(next);
      setExtra((current) => [...current, ...page.items]);
      setNext(page.nextOffset);
    } catch (error) {
      toast.error((error as Error).message);
    }
    setLoadingMore(false);
  };

  return {
    first,
    items: [...(first.data?.items ?? []), ...extra],
    hasMore: next !== null,
    loadingMore,
    loadMore,
  };
}
