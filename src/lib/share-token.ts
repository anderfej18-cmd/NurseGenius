const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * A new private link for a shared test: 192 random bits for the link, and the SHA-256 of it for the
 * database. Only the hash is stored, so the link cannot be read back later; it exists only in the
 * address the admin copies once.
 */
export async function createShareToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(24)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { token, tokenHash: toHex(new Uint8Array(digest)) };
}

/** The address candidates open for a shared test. */
export const testUrl = (origin: string, token: string): string => `${origin}/test/${token}`;
