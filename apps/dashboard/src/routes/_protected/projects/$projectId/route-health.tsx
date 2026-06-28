import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { RouteHealthScreen } from "#/features/route-health/route-health-screen"
import { projectsQueryOptions } from "#/lib/api/queries"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/route-health",
)({
  component: RouteHealthRoute,
})

function RouteHealthRoute() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)
  const environmentId = environment_id ?? project?.environments[0]?.id ?? ""
  return (
    <RouteHealthScreen projectId={projectId} environmentId={environmentId} />
  )
}
