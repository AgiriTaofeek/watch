import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute("/_protected/projects/$projectId/issues")({
  component: () => (
    <ScreenPlaceholder
      title="Issues"
      description="Grouped frontend errors with status filtering land here (Task 12)."
    />
  ),
})
