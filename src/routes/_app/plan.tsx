import { createFileRoute } from "@tanstack/react-router";
import { PlanPanel } from "@/components/progress/PlanPanel";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/_app/plan")({
  component: StudyPlan,
  head: () => ({
    meta: [
      { title: "Study Plan | NurseGenius" },
      { name: "description", content: "Your week-by-week study plan to your exam date." },
    ],
  }),
});

function StudyPlan() {
  return (
    <SignedInPage title="Study Plan" description="Your week-by-week plan to your exam date.">
      {() => <PlanPanel />}
    </SignedInPage>
  );
}
