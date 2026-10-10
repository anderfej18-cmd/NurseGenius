import { useCallback, useEffect, useRef, useState } from "react";

export interface ServerData<T> {
  /** The latest successful answer, kept while a reload runs. */
  data: T | null;
  /** The safe message of the last failure, or null. */
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads data from a server function when `enabled`, and again when `deps` change. A failure becomes
 * a message to show (server errors already carry only safe text); an answer that arrives after the
 * screen moved on is dropped.
 */
export function useServerData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): ServerData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const latest = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const run = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const result = await loader.current();
      if (ticket !== latest.current) return;
      setData(result);
      setError(null);
    } catch (failure) {
      if (ticket !== latest.current) return;
      setError(
        failure instanceof Error ? failure.message : "Something went wrong. Please try again.",
      );
    }
    if (ticket === latest.current) setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void run();
    else setLoading(false);
    // The caller names what should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { data, error, loading, reload: run };
}
