import { createFileRoute } from "@tanstack/react-router";
import { TodayPanel } from "@/components/progress/TodayPanel";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/today")({
  component: StudyToday,
  head: () => ({
    meta: [
      { title: "Study Today — NurseGenius" },
      {
        name: "description",
        content: "What to study today, why, and your streak and daily challenge.",
      },
    ],
  }),
});

function StudyToday() {
  return (
    <SignedInPage
      title="Study Today"
      description="What to study today and why, with your streak and daily challenge."
    >
      {() => <TodayPanel />}
    </SignedInPage>
  );
}
