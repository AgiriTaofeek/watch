import { createFileRoute } from "@tanstack/react-router"
import { PerformanceScreen } from "#/features/performance/performance-screen"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/performance",
)({
  component: PerformanceScreen,
})
