import { createFileRoute } from "@tanstack/react-router"
import { RouteHealthScreen } from "#/features/route-health/route-health-screen"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/route-health",
)({
  component: RouteHealthScreen,
})
