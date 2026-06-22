import { createFileRoute } from "@tanstack/react-router"
import { ProjectSettings } from "#/features/settings/project-settings"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/settings",
)({
  component: SettingsScreen,
})

function SettingsScreen() {
  const { projectId } = Route.useParams()
  return <ProjectSettings projectId={projectId} />
}
