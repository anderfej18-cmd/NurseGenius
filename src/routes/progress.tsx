import { createFileRoute, redirect } from "@tanstack/react-router";

// The old combined page. Its tabs are now pages of their own; this keeps saved links working.
export const Route = createFileRoute("/progress")({
  beforeLoad: () => {
    throw redirect({ to: "/today", replace: true });
  },
});
