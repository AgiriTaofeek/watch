import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute("/_protected/projects/$projectId/vitals")({
  component: () => (
    <ScreenPlaceholder
      title="Web Vitals"
      description="LCP, CLS, INP, FCP and TTFB trends land here (Task 13)."
    />
  ),
})
