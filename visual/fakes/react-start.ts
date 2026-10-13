// The harness has no server. The one part of TanStack Start the pages use in the browser, `useServerFn`,
// is just the function itself (already a fixture-backed call). `createServerFn` and `createMiddleware`
// exist only so a module that declares one can still be loaded; they never run a handler.
export function useServerFn<F extends (...args: never[]) => unknown>(fn: F): F {
  return fn;
}

const chain: unknown = new Proxy(() => chain, { get: () => chain, apply: () => chain });
export const createServerFn = (): unknown => chain;
export const createMiddleware = (): unknown => chain;
