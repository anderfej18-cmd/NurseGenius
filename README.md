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

- `bun run build` — production build.
- `bun run lint` — lint the project.

## Configuration

Connect the app to its Lovable Cloud project and use that project's local development configuration. Never commit `.env` files or private credentials.

Paystack checkout requires the browser publishable key `VITE_PAYSTACK_PUBLIC_KEY` and the server-side `PAYSTACK_SECRET_KEY`. The server verifies successful payments before activating a plan. Keep the secret key in Lovable Cloud secrets; never expose it in browser code.

The AI question explanations use the app's configured AI service. Database migrations are stored in `supabase/migrations/`.

## Shared tests

Admins can create a test from selected question-bank areas or upload a TXT question file. Uploaded questions remain separate from the main question bank until an admin explicitly imports them. Tests support up to 250 questions, a 10–180 minute duration, and an expiry date. Each published test has a private share link.

## Security

- Keep private keys and local environment files out of source control.
- Administrative operations are protected by server-side role checks and database access policies.
- Payment plans are activated only after server-side confirmation with Paystack.
- Public test links contain unguessable tokens; the database stores token hashes.