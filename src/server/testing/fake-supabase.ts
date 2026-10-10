import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface RecordedCall {
  method: string;
  args: unknown[];
}
export interface Recorded {
  /** "from:<table>" or "rpc:<function>" */
  target: string;
  chain: RecordedCall[];
}
export interface FakeResponse {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

/**
 * A query-builder stand-in that records every call and answers each awaited query with the next
 * queued response. Lets repository tests assert which filters were applied without a database.
 */
export function createFakeSupabase(responses: FakeResponse[] = []) {
  const queue = [...responses];
  const recorded: Recorded[] = [];

  const builder = (target: string, initial: RecordedCall[] = []) => {
    const chain = [...initial];
    recorded.push({ target, chain });
    const proxy: unknown = new Proxy(() => undefined, {
      get(_target, property) {
        if (property === "then") {
          const response = queue.shift() ?? {};
          return (resolve: (value: unknown) => void) =>
            resolve({ data: response.data ?? null, error: response.error ?? null });
        }
        return (...args: unknown[]) => {
          chain.push({ method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };

  const client = {
    from: (table: string) => builder(`from:${table}`),
    rpc: (name: string, args: unknown) =>
      builder(`rpc:${name}`, [{ method: "args", args: [args] }]),
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    recorded,
    /** All recorded calls of `method` on queries against `target`. */
    callsOn: (target: string, method: string) =>
      recorded
        .filter((entry) => entry.target === target)
        .flatMap((entry) => entry.chain.filter((call) => call.method === method)),
  };
}
