import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * The caller's network address for rate limiting (ADR-0007). Cloudflare sets `cf-connecting-ip` and
 * overwrites any value a client sends; without it the address is "unknown", which puts such requests
 * in one shared (stricter) bucket rather than letting a client pick its own.
 */
export function clientAddress(): string {
  const direct = getRequestHeader("cf-connecting-ip")?.trim();
  return direct !== undefined && direct !== "" ? direct.slice(0, 64) : "unknown";
}
