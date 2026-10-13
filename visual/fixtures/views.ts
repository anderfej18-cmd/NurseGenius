// The screens the harness can show: an id, the address to open and who is signed in. Phase by phase this
// grows to cover every page; a page whose functions have no fixture yet shows its honest error state.
import type { Persona } from "./identity";

export interface View {
  path: string;
  persona: Persona;
  /** Which state of a shared test the fixtures describe (and, for the last two, a remembered attempt). */
  variant?: "live" | "upcoming" | "closed" | "running" | "result";
}

export const VIEWS: Record<string, View> = {
  landing: { path: "/", persona: "signed_out" },
  auth: { path: "/auth", persona: "signed_out" },
  onboarding: { path: "/onboarding", persona: "new_student" },
  "not-found": { path: "/no-such-page", persona: "signed_out" },
  dashboard: { path: "/dashboard", persona: "student" },
  today: { path: "/today", persona: "student" },
  "exam-start": { path: "/exam/start", persona: "student" },
  "exam-results": { path: "/exam/fixture-exam-0/results", persona: "student" },
  "exam-runtime": { path: "/exam/fixture-exam-0", persona: "student" },
  topics: { path: "/topics", persona: "student" },
  plan: { path: "/plan", persona: "student" },
  history: { path: "/history", persona: "student" },
  mistakes: { path: "/mistakes", persona: "student" },
  bookmarks: { path: "/bookmarks", persona: "student" },
  mastery: { path: "/mastery", persona: "student" },
  analysis: { path: "/analysis", persona: "student" },
  achievements: { path: "/achievements", persona: "student" },
  friends: { path: "/friends", persona: "student" },
  leaderboard: { path: "/leaderboard", persona: "student" },
  notifications: { path: "/notifications", persona: "student" },
  profile: { path: "/profile", persona: "student" },
  payments: { path: "/payments", persona: "student" },
  "shared-test": { path: "/test/fixture-token", persona: "signed_out" },
  "shared-test-upcoming": {
    path: "/test/fixture-token",
    persona: "signed_out",
    variant: "upcoming",
  },
  "shared-test-closed": { path: "/test/fixture-token", persona: "signed_out", variant: "closed" },
  "shared-test-running": { path: "/test/fixture-token", persona: "signed_out", variant: "running" },
  "shared-test-result": { path: "/test/fixture-token", persona: "signed_out", variant: "result" },
  "admin-home": { path: "/admin", persona: "central_admin" },
  "admin-sub": { path: "/admin", persona: "admin" },
  "admin-questions": { path: "/admin?tab=questions", persona: "central_admin" },
  "admin-bank": { path: "/admin?tab=bank", persona: "central_admin" },
  "admin-reports": { path: "/admin?tab=reports", persona: "central_admin" },
  "admin-custom-tests": { path: "/admin?tab=custom-tests", persona: "central_admin" },
  "admin-audit": { path: "/admin?tab=audit", persona: "central_admin" },
  "admin-leaderboards": { path: "/admin?tab=leaderboards", persona: "central_admin" },
  "admin-payments": { path: "/admin?tab=payments", persona: "central_admin" },
  "admin-pricing": { path: "/admin?tab=pricing", persona: "central_admin" },
  "admin-users": { path: "/admin?tab=users", persona: "central_admin" },
  "admin-admin-access": { path: "/admin?tab=admin-access", persona: "central_admin" },
  "admin-sub-users": { path: "/admin?tab=sub-users", persona: "admin" },
};
