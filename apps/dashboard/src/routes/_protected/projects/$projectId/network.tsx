import { createFileRoute } from "@tanstack/react-router"
import { NetworkScreen } from "#/features/network/network-screen"

export const Route = createFileRoute("/_protected/projects/$projectId/network")(
  {
    component: NetworkScreen,
  },
)
