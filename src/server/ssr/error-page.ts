import { PRIMITIVES } from "@/lib/design-tokens";

// The page shown when the server itself fails before the app can render. It is static HTML with its
// own small stylesheet (no app CSS can be assumed), built from the same primitives as the app so it
// still looks like NurseGenius. Always light, like every public page. The system sans is used on
// purpose: the font files are served by the app that just failed.
const c = PRIMITIVES;

export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page did not load | NurseGenius</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 1.5rem; background: ${c["sand-50"]}; color: ${c["ink-950"]}; font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
      main { width: 100%; max-width: 32rem; }
      .mark { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 10px; background: ${c["evergreen-700"]}; margin-bottom: 1.5rem; }
      h1 { margin: 0 0 0.75rem; font-size: 2rem; line-height: 1.1; letter-spacing: -0.02em; text-wrap: balance; }
      p { margin: 0 0 1.75rem; color: ${c["ink-600"]}; text-wrap: pretty; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
      a, button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 1.25rem; border-radius: 10px; font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
      .primary { background: ${c["evergreen-700"]}; color: ${c["evergreen-50"]}; }
      .secondary { background: ${c["sand-25"]}; color: ${c["ink-950"]}; border-color: ${c["ink-500"]}; }
      a:focus-visible, button:focus-visible { outline: 2px solid ${c["evergreen-700"]}; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <main>
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M2 13 H7 L9.5 6 L13 19 L15.5 11 H22" stroke="${c["mint-400"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
      <h1>This page did not load</h1>
      <p>Something went wrong on our side. Try again, or go back to the home page.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go to the home page</a>
      </div>
    </main>
  </body>
</html>`;
}
