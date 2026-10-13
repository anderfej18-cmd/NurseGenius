import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { routeTree } from "@/routeTree.gen";
import { FIXTURE_TOKEN_HASH, fixturesFor, type FixtureState } from "./fixtures/calls";
import { identityFor } from "./fixtures/identity";
import { installHarness } from "./fixtures/runtime";
import { VIEWS } from "./fixtures/views";

// ?view=<id>&theme=light|dark|system&state=default|empty|error&delay=<ms>
const params = new URLSearchParams(location.search);
const view = VIEWS[params.get("view") ?? "dashboard"];
if (!view) throw new Error(`Unknown view. Known views: ${Object.keys(VIEWS).join(", ")}`);

const requested = params.get("state") ?? "default";
const state: FixtureState = requested === "empty" ? "empty" : "default";
const identity = identityFor(view.persona);
installHarness({
  session: identity.session,
  tables: identity.tables,
  fixtures: fixturesFor(state, view.variant),
  delayMs: Number(params.get("delay") ?? 0),
  failAll: requested === "error",
});

try {
  // A running or finished attempt is picked up from the device, as it is after a reload.
  if (view.variant === "running" || view.variant === "result")
    localStorage.setItem(
      `ng.sharedAttempt.${FIXTURE_TOKEN_HASH}`,
      JSON.stringify({
        attemptId: "fixture-attempt",
        accessKey: "fixture-access-key".padEnd(40, "k"),
        email: "student@ng-visual-fixture.example",
      }),
    );
  else localStorage.removeItem(`ng.sharedAttempt.${FIXTURE_TOKEN_HASH}`);
  localStorage.setItem("ng.theme", params.get("theme") ?? "light");
} catch {
  // Storage can be blocked; the default theme applies.
}

const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: [view.path] }),
  context: { queryClient: new QueryClient() },
});

// The root route renders the whole document (<html>, <head>, <body>), so React takes over the document
// itself, as it does in the real app. Mounting that inside a <div> is invalid and froze the page whenever
// a text field was present.
createRoot(document).render(<RouterProvider router={router} />);
