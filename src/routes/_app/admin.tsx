import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { AdminAccessTab } from "@/components/admin/AdminAccessTab";
import { AuditQuestionsTab } from "@/components/admin/AuditQuestionsTab";
import { CustomTestsTab } from "@/components/admin/CustomTestsTab";
import { LeaderboardsTab } from "@/components/admin/LeaderboardsTab";
import { PaymentsTab } from "@/components/admin/PaymentsTab";
import { PricingTab } from "@/components/admin/PricingTab";
import { QuestionBankTab } from "@/components/admin/QuestionBankTab";
import { QuestionsTab } from "@/components/admin/QuestionsTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { SubAdminUsersTab } from "@/components/admin/SubAdminUsersTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { adminTabsFor, resolveAdminTab, type AdminTabId } from "@/lib/navigation";

export const Route = createFileRoute("/_app/admin")({
  component: Admin,
  // Which tab is open lives in the address, so every admin tab has a link of its own.
  validateSearch: (raw: Record<string, unknown>): { tab?: string } =>
    typeof raw.tab === "string" ? { tab: raw.tab } : {},
  head: () => ({
    meta: [
      { title: "Administration | NurseGenius" },
      {
        name: "description",
        content: "Manage NurseGenius nursing practice questions, users, and shared tests.",
      },
      { property: "og:title", content: "Administration | NurseGenius" },
      {
        property: "og:description",
        content: "Manage nursing practice questions, users, and shared tests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** The panel each admin tab shows. Every tab in the navigation list must have one (the type enforces it). */
const ADMIN_PANELS: Record<AdminTabId, () => ReactNode> = {
  questions: () => <QuestionsTab />,
  bank: () => <QuestionBankTab />,
  reports: () => <ReportsTab />,
  "custom-tests": () => <CustomTestsTab />,
  audit: () => <AuditQuestionsTab />,
  leaderboards: () => <LeaderboardsTab />,
  payments: () => <PaymentsTab />,
  pricing: () => <PricingTab />,
  users: () => <UsersTab />,
  "admin-access": () => <AdminAccessTab />,
  "sub-users": () => <SubAdminUsersTab />,
};

/**
 * The admin area. The sidebar (and the phone menu) list the tabs, so the page shows only the open one,
 * under its own title. Who may open which tab comes from the navigation list; the database enforces the
 * same rules, so this page only decides what to show.
 */
function Admin() {
  const { user, isAdmin, isCentralAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/dashboard" });
  }, [loading, user, isAdmin, navigate]);

  if (!isAdmin)
    return (
      <div aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  // The tabs this admin may open; a tab named in the address that they may not open shows the default.
  const viewer = { signedIn: !!user, onboarded: true, isAdmin, isCentralAdmin };
  const active = resolveAdminTab(search.tab, viewer);
  const tab = adminTabsFor(viewer).find((candidate) => candidate.id === active);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={tab?.label ?? "Administration"} description={tab?.description} />
      <div key={active}>{ADMIN_PANELS[active]()}</div>
    </div>
  );
}
