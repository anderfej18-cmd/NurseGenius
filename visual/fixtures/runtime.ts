// How a fixture answers a server-function call. A fixture is a value, or a function of the call's input.
// A function with no fixture rejects with the same safe message the real server gives, so a page shows
// its honest error state instead of inventing content.
export type Fixture = unknown | ((input: unknown) => unknown);
export type FixtureMap = Record<string, Fixture>;

export const SAFE_ERROR = "Something went wrong. Please try again.";

export function installHarness(options: {
  session: unknown;
  tables: Record<string, unknown[]>;
  fixtures: FixtureMap;
  /** Milliseconds each answer is delayed, to show loading states. */
  delayMs: number;
  /** `error`: every call fails. */
  failAll: boolean;
}): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.__harness = { session: options.session, tables: options.tables };
  globals.__harnessCall = async (name: string, input: unknown) => {
    if (options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.failAll || !(name in options.fixtures)) throw new Error(SAFE_ERROR);
    const fixture = options.fixtures[name];
    return typeof fixture === "function" ? (fixture as (i: unknown) => unknown)(input) : fixture;
  };
}
