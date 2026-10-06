import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/exam/$examId")({ component: ExamLayout });

function ExamLayout() {
  return <Outlet />;
}
