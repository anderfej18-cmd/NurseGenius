import { createFileRoute } from "@tanstack/react-router";
import { AnalysisPanel } from "@/components/progress/AnalysisPanel";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/_app/analysis")({
  component: Analysis,
  head: () => ({
    meta: [
      { title: "Performance Analysis | NurseGenius" },
      {
        name: "description",
        content: "Trends, repeated mistakes, pace and confidence in your answers.",
      },
    ],
  }),
});

function Analysis() {
  return (
    <SignedInPage
      title="Performance Analysis"
      description="Trends, repeated mistakes, pace and confidence in your answers."
    >
      {() => <AnalysisPanel />}
    </SignedInPage>
  );
}
