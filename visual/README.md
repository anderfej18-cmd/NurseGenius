# Visual QA harness

A separate Vite app, used only to look at the interface. It renders the **real route tree and real
components** with two things replaced:

- the browser Supabase client is a stub (`fakes/supabase-client.ts`) that answers the session, the person's
  profile and their roles from `fixtures/identity.ts`;
- every server function (`@/functions/*.functions`) answers from typed fixtures (`fixtures/calls.ts`). A
  function with no fixture rejects with the server's own safe message, so a page shows its honest error
  state instead of invented content.

The fixtures are synthetic. They exist only in this folder, which is outside `src/`; the application cannot
import it and `src/lib/harness-isolation.test.ts` fails if it ever does or if a fixture marker appears in a
build.

## Run

```
bunx vite --config visual/vite.config.ts            # http://127.0.0.1:5188
bunx tsc -p visual/tsconfig.json --noEmit           # fixtures are checked against the real return types
node visual/scripts/shoot.mjs "http://127.0.0.1:5188/?view=dashboard&theme=dark" out.png 390 844 --dark
node visual/scripts/matrix.mjs <outDir> [viewId ...]   # every view, five widths, both themes
```

`shoot.mjs` drives Google Chrome through the DevTools protocol (Node 22 or newer, no dependencies): true
device emulation (so 320px really is 320px), `--reduced` for reduced motion, `--dark` for the system colour
scheme, `--eval=` to click something first, and a report of horizontal overflow and console errors.

Query parameters: `view` (a key of `fixtures/views.ts`), `theme` (`light`, `dark`, `system`), `state`
(`default`, `empty`, `error`) and `delay` (milliseconds each answer is held back, to see loading states).

The root route renders the whole document (`<html>`, `<head>`, `<body>`), so the harness lets React take over
`document` itself, as the real app does. An earlier version mounted it inside a `<div>`; that is invalid and
froze the page whenever a text field was on screen. Any console error `shoot.mjs` prints is therefore real.

## What it does not prove

It shows how screens look and behave with the data it is given. It says nothing about the real database,
the Edge Functions, Paystack or sign-in; those are not verified by it.
