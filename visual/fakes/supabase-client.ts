// A stand-in for the browser Supabase client. The real AuthProvider runs unchanged on top of it: it
// reads a session, the person's profile and their roles from `globalThis.__harness`. Any other table
// answers from `tables` (empty by default). No network is ever used.
interface Harness {
  session: unknown;
  tables: Record<string, unknown[]>;
}

const harness = (): Harness => (globalThis as unknown as { __harness: Harness }).__harness;

type Result = { data: unknown; error: null };

/** A query builder that records nothing and answers when awaited, like the real one. */
function builder(table: string): unknown {
  let single = false;
  const proxy: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === "then") {
        const rows = harness().tables[table] ?? [];
        const result: Result = { data: single ? (rows[0] ?? null) : rows, error: null };
        return (resolve: (value: Result) => void) => resolve(result);
      }
      return (..._args: unknown[]) => {
        if (property === "maybeSingle" || property === "single") single = true;
        return proxy;
      };
    },
  });
  return proxy;
}

const channel = {
  on: () => channel,
  subscribe: () => channel,
  unsubscribe: () => undefined,
};

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: harness().session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signInWithPassword: async () => ({ data: {}, error: null }),
    signUp: async () => ({ data: {}, error: null }),
    signInWithOAuth: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: (table: string) => builder(table),
  rpc: async () => ({ data: null, error: null }),
  channel: () => channel,
  removeChannel: () => undefined,
  functions: { invoke: async () => ({ data: null, error: null }) },
};
