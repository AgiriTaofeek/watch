import { createFileRoute } from "@tanstack/react-router"
import { IssueDetail } from "#/features/issues/issue-detail"

export const Route = createFileRoute(
  "/_protected/projects/$projectId/issues/$issueId",
)({
  component: IssueDetailRoute,
})

function IssueDetailRoute() {
  const { projectId, issueId } = Route.useParams()
  return <IssueDetail projectId={projectId} issueId={issueId} />
}
