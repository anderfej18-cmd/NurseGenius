# ADR-0010: The Worker sets its own security headers; `.env` stays tracked but is guarded

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- Audit finding S5: no response header was set by the application. Shared-test links carry their credential in the URL path.
- Audit finding L1: `.env` is tracked in Git. Inspection (key names, the decoded role claim of its JWT, a pattern scan of the tree and the whole history) showed it holds only the Supabase URL, project id and **anon** key, and a Paystack **public** key: values the browser bundle contains by design. No service-role key, Paystack secret or private key was ever committed.
- The file was added by the hosting platform's own commits, which suggests the platform manages it. Untracking it could make a platform build lose the `VITE_*` values and ship a broken app, and rotating public keys would change nothing.
- The browser's behaviour with a strict Content-Security-Policy cannot be verified from this repository: no browser test harness exists, and TanStack Start's server-rendered inline scripts need a nonce that this setup does not add.

## Decision Outcome

**Headers** (`src/server/http/security-headers.ts`, applied to every response in `src/server.ts`):

- Always: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on `/test/*`), a `Permissions-Policy` that denies camera, microphone, geolocation and USB.
- `Strict-Transport-Security: max-age=31536000` only on HTTPS requests.
- **Enforced**: `Content-Security-Policy: frame-ancestors 'self'` plus the platform's preview origins, which blocks clickjacking by other sites without touching scripts or styles. `X-Frame-Options` is not set because it cannot express the preview allowlist.
- **Report-Only**: a strict policy built from the hosts the app really uses (Paystack script and checkout, Supabase APIs). It is not enforced because it could blank the app unseen; promote it by renaming the header once the console shows no violations. It keeps `'unsafe-inline'` for scripts until nonces are possible, so it does not yet protect against injected inline script.
- A header a route sets itself is never overwritten.

**`.env`**: keep it tracked, do not rotate anything, and guard it. `src/server/env-files.test.ts` fails (without printing a value) if a tracked environment file gains a key outside the public allowlist, a JWT whose role is not `anon`, or a secret-shaped Paystack key. `.gitignore` already ignores every other `.env.*` file. If the platform is later confirmed not to need the file, untrack it with `git rm --cached .env`; nothing else changes.

### Negative Consequences

- The framing allowlist names the platform's current preview domains. If the editor embeds the app from another origin, the preview shows blank until the list in `security-headers.ts` is extended.
- The Content-Security-Policy is not yet an XSS defence.

## Validation

`security-headers.test.ts` (each header, HTTPS-only HSTS, no Referer for shared-test links, a route's own header kept, bodies and redirects untouched) and `env-files.test.ts`. Not verified in a real browser or against the deployed Worker.
