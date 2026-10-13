// What this device remembers about a shared test it has started, so a reload or a return visit picks the
// attempt up where it was. The attempt key is the proof that this device took the test; it is kept in
// this browser only and sent only to the server, which stores just its hash.

export interface StoredAttempt {
  attemptId: string;
  accessKey: string;
  email: string;
}

/** The older hand-off used by sign-in and onboarding to link a finished attempt to a new account. */
export const HANDOFF_KEY = "ng.sharedTestAttempt";

const keyFor = (tokenHash: string): string => `ng.sharedAttempt.${tokenHash}`;

const isStoredAttempt = (value: unknown): value is StoredAttempt => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.attemptId === "string" &&
    typeof entry.accessKey === "string" &&
    typeof entry.email === "string"
  );
};

/** The attempt remembered for this link, or null when there is none or storage is unreadable. */
export function readStoredAttempt(
  storage: Pick<Storage, "getItem">,
  tokenHash: string,
): StoredAttempt | null {
  try {
    const raw = storage.getItem(keyFor(tokenHash));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberAttempt(
  storage: Pick<Storage, "setItem">,
  tokenHash: string,
  attempt: StoredAttempt,
): void {
  try {
    storage.setItem(keyFor(tokenHash), JSON.stringify(attempt));
  } catch {
    /* Private mode or a full disk: the test still works, it just cannot be resumed after a reload. */
  }
}

export function forgetAttempt(storage: Pick<Storage, "removeItem">, tokenHash: string): void {
  try {
    storage.removeItem(keyFor(tokenHash));
  } catch {
    /* nothing to forget */
  }
}
