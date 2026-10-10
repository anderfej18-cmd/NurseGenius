// The only place new server code reads environment variables.
// The Lovable-generated integration files (client.server.ts, auth-middleware.ts) read the
// environment themselves and are left unchanged; the Paystack verifier now uses this module.
import { AppError } from "./errors";

type Env = Record<string, string | undefined>;

export interface ServerConfig {
  readonly supabase: {
    readonly url: string;
    readonly publishableKey: string;
    readonly serviceRoleKey: string;
  };
  readonly paystack: { readonly secretKey: string };
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) {
    // Name only; never echo values.
    console.error(`[config] Missing required environment variable: ${name}`);
    throw new AppError("Server is not configured.", "INTERNAL", 500);
  }
  return value;
}

export function loadConfig(env: Env = process.env): ServerConfig {
  return {
    supabase: {
      url: required(env, "SUPABASE_URL"),
      publishableKey: required(env, "SUPABASE_PUBLISHABLE_KEY"),
      serviceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    },
    paystack: { secretKey: required(env, "PAYSTACK_SECRET_KEY") },
  };
}

let cached: ServerConfig | undefined;

/** Lazy and cached: Workers expose env at request time, so nothing is read at import. */
export function getConfig(): ServerConfig {
  cached ??= loadConfig();
  return cached;
}
