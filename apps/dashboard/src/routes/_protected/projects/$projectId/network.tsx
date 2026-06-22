import { createFileRoute } from "@tanstack/react-router"
import { ScreenPlaceholder } from "#/features/shell/screen-placeholder"

export const Route = createFileRoute("/_protected/projects/$projectId/network")(
  {
    component: () => (
      <ScreenPlaceholder
        title="Network"
        description="Failed network requests arrive in a later milestone."
      />
    ),
  },
)
