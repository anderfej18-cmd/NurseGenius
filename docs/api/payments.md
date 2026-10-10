# Payment verification (`POST /api/public/paystack-verify`)

Source: `src/routes/api/public/paystack-verify.ts` → `src/server/payments/`. The route is HTTP (not a server function) because the
payment page calls it with `fetch`; the path is fixed by the router.

- **Authentication**: `Authorization: Bearer <Supabase access token>`; otherwise 401. The account is the token's user, never a field of the body.
- **Request**: `{ reference: string (4–200) }`, strict.
- **Response**: `200 { ok: true, tier, expiresAt }`, or `{ error: string }` with the status below. Messages are the typed error's own; unexpected failures answer `500 Something went wrong. Please try again.` and are logged server-side.

| Status | Cause |
|---|---|
| 400 | Invalid body; plan in the payment is not `erudite`/`scholar`; currency is not NGN; amount differs from the plan's active price (compared in kobo) |
| 401 | No or invalid token |
| 402 | Paystack does not know the reference or reports it unsuccessful |
| 403 | The payment's account id or customer email is not the signed-in account's |
| 409 | The reference was already used for a different account, plan or amount |
| 502 | Paystack cannot be reached or answers unreadably (nothing about the cause is returned) |

Replaying the same reference for the same payment is harmless: the database function returns the existing expiry and changes
nothing. The Paystack secret is read only through `src/server/config.server.ts`.
