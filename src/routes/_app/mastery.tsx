import { createFileRoute } from "@tanstack/react-router";
import { MasteryPanel } from "@/components/progress/MasteryPanel";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/_app/mastery")({
  component: Mastery,
  head: () => ({
    meta: [
      { title: "Mastery & Readiness | NurseGenius" },
      {
        name: "description",
        content: "How well you know each topic and your exam-readiness estimate.",
      },
    ],
  }),
});

function Mastery() {
  return (
    <SignedInPage
      title="Mastery & Readiness"
      description="How well you know each topic, and how ready you are for the exam."
    >
      {() => <MasteryPanel />}
    </SignedInPage>
  );
}
