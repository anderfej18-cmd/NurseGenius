import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.server";

const full = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pub",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  PAYSTACK_SECRET_KEY: "psk",
};

describe("loadConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps environment variables into a typed config", () => {
    expect(loadConfig(full)).toEqual({
      supabase: { url: full.SUPABASE_URL, publishableKey: "pub", serviceRoleKey: "svc" },
      paystack: { secretKey: "psk" },
    });
  });

  it.each(Object.keys(full))("fails fast when %s is missing", (name) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const env: Record<string, string | undefined> = { ...full, [name]: undefined };
    expect(() => loadConfig(env)).toThrow("Server is not configured.");
    expect(log.mock.calls[0]?.[0]).toContain(name);
  });

  it("never puts secret values in the error output", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => loadConfig({ ...full, PAYSTACK_SECRET_KEY: "" })).toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toContain("svc");
  });
});
