import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "./security-headers";

const get = (url: string, init: ResponseInit = {}, body: string | null = "<html></html>") =>
  withSecurityHeaders(
    new Request(url),
    new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init }),
  );

describe("withSecurityHeaders", () => {
  it("sets the headers that cannot break a page on every response", async () => {
    const response = get("https://app.example/dashboard");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=(), usb=()",
    );
  });

  it("keeps shared-test links out of the Referer header entirely", () => {
    expect(get("https://app.example/test/abc123token").headers.get("referrer-policy")).toBe(
      "no-referrer",
    );
    expect(get("https://app.example/testimonials").headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sends HSTS only over HTTPS, so local development over HTTP is untouched", () => {
    expect(get("https://app.example/").headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
    expect(get("http://localhost:8080/").headers.get("strict-transport-security")).toBeNull();
  });

  it("stops other sites framing the app, while still allowing the platform's own preview frame", () => {
    const csp = get("https://app.example/").headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/^frame-ancestors 'self' /);
    expect(csp).toContain("https://*.lovable.app");
    expect(csp).not.toMatch(/frame-ancestors[^;]*\s\*(?:\s|;|$)/);
    expect(csp).not.toContain("script-src");
  });

  it("reports, without enforcing, a strict policy built from the hosts the app really uses", () => {
    const report =
      get("https://app.example/").headers.get("content-security-policy-report-only") ?? "";
    expect(report).toContain("object-src 'none'");
    expect(report).toContain("base-uri 'self'");
    expect(report).toMatch(/script-src [^;]*https:\/\/js\.paystack\.co/);
    expect(report).toMatch(/connect-src [^;]*https:\/\/\*\.supabase\.co/);
    expect(report).toMatch(/frame-src [^;]*https:\/\/checkout\.paystack\.com/);
    expect(report).not.toMatch(/script-src [^;]*\shttps:(?:\s|;|$)/);
    expect(report).not.toMatch(/default-src[^;]*\*(?:\s|;|$)/);
  });

  it("leaves a header the route already chose alone", () => {
    const response = get("https://app.example/", {
      headers: {
        "content-type": "text/html",
        "referrer-policy": "origin",
        "content-security-policy": "default-src 'none'",
      },
    });
    expect(response.headers.get("referrer-policy")).toBe("origin");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("changes nothing else about the response", async () => {
    const original = new Response("hello", {
      status: 201,
      statusText: "Created",
      headers: { "content-type": "text/plain", "x-custom": "1" },
    });
    const response = withSecurityHeaders(new Request("https://app.example/api/x"), original);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-custom")).toBe("1");
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("hello");
  });

  it("copes with redirects and empty bodies", () => {
    const response = withSecurityHeaders(
      new Request("https://app.example/old"),
      Response.redirect("https://app.example/new", 302),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/new");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
