import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
import { PaystackProvider } from "./paystack.provider.server";

const SECRET = "sk_test_supersecret";
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const body = {
  status: true,
  data: {
    status: "success",
    reference: "ref-1",
    amount: 150000,
    currency: "NGN",
    customer: { email: "s@example.com" },
    metadata: { user_id: "u1", plan: "erudite" },
  },
};

describe("PaystackProvider.verify", () => {
  it("asks Paystack about exactly this reference, encoded, with the secret in the Authorization header only", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ok(body));
    const result = await new PaystackProvider({
      secretKey: SECRET,
      fetcher,
      timeoutMs: 5000,
    }).verify("a b/c?d");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/transaction/verify/a%20b%2Fc%3Fd");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(url).not.toContain(SECRET);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      status: "success",
      reference: "ref-1",
      amountKobo: 150000,
      currency: "NGN",
      customerEmail: "s@example.com",
      metadataUserId: "u1",
      metadataPlan: "erudite",
    });
  });

  it("returns null when Paystack says the transaction is not successful or unknown", async () => {
    const provider = (response: Response) =>
      new PaystackProvider({ secretKey: SECRET, fetcher: async () => response, timeoutMs: 5000 });
    expect(await provider(ok({ status: false, message: "not found" })).verify("x")).toBeNull();
    expect(await provider(ok({}, 404)).verify("x")).toBeNull();
  });

  it.each([
    ["an upstream error", async () => ok({ message: "secret upstream detail" }, 500)],
    [
      "a network failure",
      async () => {
        throw new Error(`connect ECONNREFUSED ${SECRET}`);
      },
    ],
    ["an unreadable answer", async () => new Response("<html>oops</html>", { status: 200 })],
  ])("turns %s into a 502 that says nothing about the cause", async (_label, fetcher) => {
    const error = await new PaystackProvider({ secretKey: SECRET, fetcher, timeoutMs: 5000 })
      .verify("x")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect(JSON.stringify(error)).not.toMatch(/secret|ECONNREFUSED|oops|sk_test/);
  });
});
