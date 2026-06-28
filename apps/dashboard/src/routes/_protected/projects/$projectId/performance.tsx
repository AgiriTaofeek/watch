import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PerformanceScreen } from "#/features/performance/performance-screen"
import { projectsQueryOptions } from "#/lib/api/queries"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/performance",
)({
  component: PerformanceRoute,
})

function PerformanceRoute() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)
  const environmentId = environment_id ?? project?.environments[0]?.id ?? ""
  return (
    <PerformanceScreen projectId={projectId} environmentId={environmentId} />
  )
}
