import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { NetworkScreen } from "#/features/network/network-screen"
import { projectsQueryOptions } from "#/lib/api/queries"

export const Route = createFileRoute("/_protected/projects/$projectId/network")(
  {
    component: NetworkRoute,
  },
)

function NetworkRoute() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)
  const environmentId = environment_id ?? project?.environments[0]?.id ?? ""
  return <NetworkScreen projectId={projectId} environmentId={environmentId} />
}
