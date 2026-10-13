# Payment verification (`POST /api/public/paystack-verify`)

Source: `src/routes/api/public/paystack-verify.ts` → `src/server/payments/`. The route is HTTP (not a server function) because the
payment page calls it with `fetch`; the path is fixed by the router.

- **Authentication**: `Authorization: Bearer <Supabase access token>`; otherwise 401. The account is the token's user, never a field of the body.
- **Request**: `{ reference: string (4–200) }`, strict.
- **Response**: `200 { ok: true, tier, expiresAt }`, or `{ error: string }` with the status below. Messages are the typed error's own; unexpected failures answer `500 Something went wrong. Please try again.` and are logged server-side.

| Status | Cause                                                                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid body; plan in the payment is not `erudite`/`scholar`; currency is not NGN; amount differs from the plan's active price (compared in kobo)                                  |
| 401    | No or invalid token                                                                                                                                                                |
| 402    | Paystack does not know the reference or reports it unsuccessful                                                                                                                    |
| 403    | The payment's account id or customer email is not the signed-in account's                                                                                                          |
| 409    | The reference was already used for a different account, plan or amount                                                                                                             |
| 500    | `Server is not configured.`: a required server setting is missing (`PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, …). Always JSON; the log names the setting, never its value |
| 502    | Paystack cannot be reached or answers unreadably (nothing about the cause is returned)                                                                                             |

Replaying the same reference for the same payment is harmless: the database function returns the existing expiry and changes
nothing. The Paystack secret is read only through `src/server/config.server.ts`.

## When a payment fails: what the message means

The payment page shows `Payment received but activation failed: <message>` whenever Paystack reported a finished
checkout but this endpoint did not activate the plan. The message points to the cause:

| Message                                                   | Likely cause                                                                                                                                                                                                           | What to check                                                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Server is not configured.`                               | A server secret is missing in the Worker's environment                                                                                                                                                                 | `PAYSTACK_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` exist as secrets (names only; never print values)                                                                          |
| `Payment was not confirmed as successful.`                | Paystack does not know the reference, or reports it `abandoned`, `pending`, `failed` or `reversed`. A live public key with a test secret key (or the reverse) gives "unknown reference"                                | The key mode of `VITE_PAYSTACK_PUBLIC_KEY` (`pk_live_`/`pk_test_`) matches `PAYSTACK_SECRET_KEY` (`sk_live_`/`sk_test_`), and the transaction's status in the Paystack dashboard |
| `Could not verify the payment with the payment provider.` | Paystack unreachable, or it rejected the secret key                                                                                                                                                                    | The secret key is current; Paystack status                                                                                                                                       |
| `The paid amount does not match the selected plan.`       | The price changed between checkout and verification, or the currency is not NGN                                                                                                                                        | The plan's price in `plans`; the amount in the dashboard (kobo)                                                                                                                  |
| `This payment does not match the signed-in account.`      | Paid while signed in as someone else, or with another email                                                                                                                                                            | The payment's customer email and `metadata.user_id`                                                                                                                              |
| `Something went wrong. Please try again.`                 | An unexpected server error, logged with `console.error`. A common cause is a migration not applied: `consume_rate_limit` (migration 13) is called before Paystack is asked, and `activate_verified_subscription` after | The Worker logs for the error text; that the migrations in `docs/deployment.md` section 1 are applied                                                                            |

**Reconciling a customer who paid but is not activated.** Never activate from a redirect, a screenshot or the
customer's word. Open the transaction in the Paystack dashboard and require all of: status `success`, currency NGN,
the amount equal to the plan's price, and the customer's email equal to the account's. Then, as the service role, run
`SELECT public.activate_verified_subscription('<user id>', '<erudite|scholar>', '<paystack reference>', <price in naira>);`.
The function refuses a price that is not the active one and a reference already used by someone else, and repeating it
for the same payment changes nothing. A customer whose checkout was `abandoned` or `failed` was not charged and is not
activated.

There is no webhook: a payment that is still pending when the checkout closes is not activated later by itself. The
customer must be reconciled as above, or pay again.
