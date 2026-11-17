import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/workflows")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Workflows</h1>
      <p>Construtor visual de automações ainda em desenvolvimento.</p>
    </div>
  );
}
