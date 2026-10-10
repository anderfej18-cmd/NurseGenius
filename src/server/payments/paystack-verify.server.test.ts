import { describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError } from "../errors";
import { type PaymentVerificationDeps, handlePaymentVerification } from "./paystack-verify.server";

const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer token" }) =>
  new Request("https://app.example/api/public/paystack-verify", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function setup(overrides: Partial<PaymentVerificationDeps> = {}) {
  const deps = {
    authenticate: vi.fn(
      async (_token: string) =>
        ({ id: "user-1", email: "s@example.com" }) as { id: string; email: string } | null,
    ),
    verify: vi.fn(async () => ({ tier: "erudite", expiresAt: "2026-11-10T00:00:00.000Z" })),
    ...overrides,
  } satisfies PaymentVerificationDeps;
  return deps;
}
const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

describe("handlePaymentVerification", () => {
  it("answers 401 without a bearer token, or with one that is not a signed-in user, and verifies nothing", async () => {
    const deps = setup({ authenticate: vi.fn(async () => null) });
    expect(
      (await handlePaymentVerification(post({ reference: "ref-12345" }, {}), deps)).status,
    ).toBe(401);
    expect((await handlePaymentVerification(post({ reference: "ref-12345" }), deps)).status).toBe(
      401,
    );
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it.each([
    ["not json"],
    [{}],
    [{ reference: "" }],
    [{ reference: "abc" }],
    [{ reference: "x".repeat(201) }],
    [{ reference: 12345 }],
    [{ reference: "ref-12345", userId: "other" }],
  ])("answers 400 for the body %j", async (payload) => {
    const deps = setup();
    const response = await handlePaymentVerification(post(payload), deps);
    expect(response.status).toBe(400);
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("verifies for the account behind the token, never one named in the body", async () => {
    const deps = setup();
    const response = await handlePaymentVerification(post({ reference: "ref-12345" }), deps);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      ok: true,
      tier: "erudite",
      expiresAt: "2026-11-10T00:00:00.000Z",
    });
    expect(deps.verify).toHaveBeenCalledWith({ id: "user-1", email: "s@example.com" }, "ref-12345");
  });

  it("passes a typed refusal on with its status and its own message", async () => {
    const forbidden = setup({
      verify: vi.fn(async () => {
        throw new ForbiddenError("This payment does not match the signed-in account.");
      }),
    });
    const response = await handlePaymentVerification(post({ reference: "ref-12345" }), forbidden);
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "This payment does not match the signed-in account.",
    });
    const replay = setup({
      verify: vi.fn(async () => {
        throw new ConflictError("This payment reference has already been used.");
      }),
    });
    expect((await handlePaymentVerification(post({ reference: "ref-12345" }), replay)).status).toBe(
      409,
    );
  });

  it("answers an unexpected failure with a generic 500 and never the database text", async () => {
    const deps = setup({
      verify: vi.fn(async () => {
        throw new Error(
          'duplicate key value violates "subscription_payments_pkey" (password=hunter2)',
        );
      }),
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handlePaymentVerification(post({ reference: "ref-12345" }), deps);
    expect(response.status).toBe(500);
    const text = JSON.stringify(await json(response));
    expect(text).not.toMatch(/duplicate|hunter2|pkey/);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
