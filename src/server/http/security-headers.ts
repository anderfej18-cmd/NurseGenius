// Response headers the application sets itself (ADR-0010). The hosting platform may add more; these
// are the ones whose absence the audit found, chosen so none of them can break a page.

/** Who may put the app in a frame: itself and the platform's own preview/editor pages. */
const FRAME_ANCESTORS = [
  "'self'",
  "https://lovable.dev",
  "https://*.lovable.dev",
  "https://*.lovable.app",
  "https://*.lovableproject.com",
] as const;

/**
 * A strict policy built from the hosts the app really loads from (Paystack's script and checkout,
 * the Supabase APIs). It is sent as Report-Only: TanStack Start renders inline scripts that need a
 * nonce this setup cannot add, and enforcing it unseen could blank the app. Promote it by
 * renaming the header once the browser console shows no violations.
 */
const REPORT_ONLY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.paystack.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://*.paystack.co",
  "frame-src https://checkout.paystack.com https://*.paystack.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const BASE_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "content-security-policy": `frame-ancestors ${FRAME_ANCESTORS.join(" ")}`,
  "content-security-policy-report-only": REPORT_ONLY_POLICY,
};

/** A shared-test link carries its credential in the path, so it must never be sent as a Referer. */
const isSharedTestPath = (pathname: string) => pathname.startsWith("/test/");

/** Adds the headers to a copy of the response; a header the route already set is kept as it chose. */
export function withSecurityHeaders(request: Request, response: Response): Response {
  if (response.status === 101) return response;
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  const add = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  for (const [name, value] of Object.entries(BASE_HEADERS)) add(name, value);
  add(
    "referrer-policy",
    isSharedTestPath(url.pathname) ? "no-referrer" : "strict-origin-when-cross-origin",
  );
  if (url.protocol === "https:") add("strict-transport-security", "max-age=31536000");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
