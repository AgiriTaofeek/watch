import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { OverviewScreen } from "#/features/overview/overview-screen"
import { projectsQueryOptions } from "#/lib/api/queries"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/overview",
)({
  component: OverviewRoute,
})

function OverviewRoute() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)
  // URL is authoritative; fall back to the first environment when absent.
  const environmentId = environment_id ?? project?.environments[0]?.id ?? ""

  return <OverviewScreen projectId={projectId} environmentId={environmentId} />
}
