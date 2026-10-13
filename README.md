# NurseGenius

NurseGenius is a nursing exam-preparation app for Registered Nurse (RN) and Registered Midwife (RM) candidates. It combines timed practice, answer explanations, progress tracking, leaderboards, tiered access, and administration tools.

## Features

- Timed RN and RM practice exams with question navigation, answer flagging, and results review.
- Daily question allowances and session sizes based on the user's access tier.
- AI explanations for practice questions.
- Daily and weekly practice leaderboards.
- Paystack plan checkout with server-side transaction verification before account access changes.
- Admin tools for question-bank management, user access, and isolated shared tests.
- Shared tests with expiring links, email entry, timed attempts, results, and optional question-bank import.
- Lovable Cloud authentication, data storage, and access controls.

## Development

This project uses TanStack Start, React, TypeScript, and Vite.

1. Install Bun, then run `bun install`.
2. Configure the development environment variables described below.
3. Run `bun run dev` to start the local development server.

Useful checks:

- `bun run test` — unit tests, and every migration replayed on PGlite.
- `bun run lint` — lint the project.
- `bun run typecheck` — TypeScript.
- `bun run build` — production build.

Where to read next: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (layers and rules), [docs/ROUTE_MAP.md](docs/ROUTE_MAP.md) (every page), [docs/FEATURE_INVENTORY.md](docs/FEATURE_INVENTORY.md) (what works), [docs/deployment.md](docs/deployment.md) (migrations and Edge Functions, in order), [docs/design/DESIGN.md](docs/design/DESIGN.md) (design system).

## Configuration

Connect the app to its Lovable Cloud project and use that project's local development configuration. Never commit `.env` files or private credentials.

Paystack checkout requires the browser publishable key `VITE_PAYSTACK_PUBLIC_KEY` and the server-side `PAYSTACK_SECRET_KEY`. The server verifies successful payments before activating a plan. Keep the secret key in Lovable Cloud secrets; never expose it in browser code.

The AI question explanations use the app's configured AI service. Database migrations are stored in `supabase/migrations/`.

## Live tests (shared tests)

Admins build a test by drawing a random set from chosen question-bank topics, or from an uploaded TXT file whose questions stay separate from the main bank until an admin imports them. A test has a start time, an expiry time, a 10–180 minute duration and up to 250 questions. The clock is the database's, so a candidate cannot extend an attempt. Anyone with the link can take it, with their email; rankings are shown once the link closes, and a finished attempt can be linked to an account. See [docs/live-tests-integration.md](docs/live-tests-integration.md).

## Security

- Keep private keys and local environment files out of source control.
- Administrative operations are protected by server-side role checks and database access policies.
- Payment plans are activated only after server-side confirmation with Paystack.
- Public test links contain unguessable tokens. The database stores a hash of each token to look a test up, and the admin's own copy of the link so it can be shown again; sub-admins cannot read student exams, payments or attempts.
