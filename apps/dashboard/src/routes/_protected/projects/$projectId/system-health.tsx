import { createFileRoute } from "@tanstack/react-router"
import { SystemHealthScreen } from "#/features/system-health/system-health-screen"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/system-health",
)({
  component: SystemHealthScreen,
})
