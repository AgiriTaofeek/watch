import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/performance",
)({
  component: () => (
    <ScreenPlaceholder
      title="Performance"
      description="Navigation and route timing arrives in a later milestone."
    />
  ),
})
