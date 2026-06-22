import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/system-health",
)({
  component: () => (
    <ScreenPlaceholder
      title="System Health"
      description="Ingestion, worker and database health arrives in a later milestone."
    />
  ),
})
