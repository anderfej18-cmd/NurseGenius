import type { InsightFacts } from "./insight.types";

/**
 * A digest of exactly what the model would be shown, plus the prompt version. Equal digests mean the
 * stored explanation is still true; a changed fact or prompt gives a new one and a fresh explanation.
 */
export async function factsHash(facts: InsightFacts, promptVersion: string): Promise<string> {
  const canonical = JSON.stringify([facts.kind, promptVersion, facts.topics, facts.facts]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
