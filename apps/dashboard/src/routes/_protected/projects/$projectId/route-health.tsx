import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/route-health",
)({
  component: () => (
    <ScreenPlaceholder
      title="Route Health"
      description="Per-route health arrives in a later milestone."
    />
  ),
})
