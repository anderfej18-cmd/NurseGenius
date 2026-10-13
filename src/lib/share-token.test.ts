import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createShareToken, testUrl } from "./share-token";

describe("createShareToken", () => {
  it("makes a 48-character hex token and the SHA-256 of that token", async () => {
    const { token, tokenHash } = await createShareToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("makes a different token every time", async () => {
    const first = await createShareToken();
    const second = await createShareToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});

describe("testUrl", () => {
  it("puts the token after /test/ on the site's own address", () => {
    expect(testUrl("https://app.example.com", "abc123")).toBe(
      "https://app.example.com/test/abc123",
    );
  });
});
