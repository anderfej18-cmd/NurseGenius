import { describe, expect, it } from "vitest";
import { forgetAttempt, readStoredAttempt, rememberAttempt } from "./shared-attempt-store";

const HASH = "a".repeat(64);
const ATTEMPT = { attemptId: "att-1", accessKey: "k".repeat(40), email: "taker@example.com" };

const memory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
};

describe("remembered shared-test attempt", () => {
  it("reads back what was remembered for that link, and nothing for another", () => {
    const storage = memory();
    rememberAttempt(storage, HASH, ATTEMPT);
    expect(readStoredAttempt(storage, HASH)).toEqual(ATTEMPT);
    expect(readStoredAttempt(storage, "b".repeat(64))).toBeNull();
  });

  it("forgets it", () => {
    const storage = memory();
    rememberAttempt(storage, HASH, ATTEMPT);
    forgetAttempt(storage, HASH);
    expect(readStoredAttempt(storage, HASH)).toBeNull();
  });

  it("ignores text that is not an attempt record", () => {
    for (const raw of [
      "{oops",
      "null",
      '{"attemptId":"x"}',
      '{"attemptId":1,"accessKey":"k","email":"e"}',
    ]) {
      const storage = memory();
      storage.setItem(`ng.sharedAttempt.${HASH}`, raw);
      expect(readStoredAttempt(storage, HASH)).toBeNull();
    }
  });

  it("copes with storage that throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredAttempt(blocked, HASH)).toBeNull();
    expect(() => rememberAttempt(blocked, HASH, ATTEMPT)).not.toThrow();
    expect(() => forgetAttempt(blocked, HASH)).not.toThrow();
  });
});
