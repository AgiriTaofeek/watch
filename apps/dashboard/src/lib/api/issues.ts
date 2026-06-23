import { createServerFn } from "@tanstack/react-start"
import { serverRequest } from "./server/request"
import type { Issue, IssueStatus } from "./types"

// updateIssueStatus throws ApiError intentionally: useMutation surfaces errors
// via mutation.isError and mutation.error, so a thrown error is the right
// contract. If a caller ever needs to branch on HTTP status codes, convert to
// Result via attempt() — see result.ts and how auth.ts handles login/setup.
// The reads (listIssues, getIssue) also throw; TanStack Query only needs an
// error value to enter its error state.

export type ListIssuesParams = {
  projectId: string
  environmentId: string
  status?: IssueStatus
  limit?: number
  offset?: number
}

export type ListIssuesResult = {
  issues: Issue[]
  total: number
  limit: number
  offset: number
}

export const listIssues = createServerFn({ method: "GET" })
  .validator((data: ListIssuesParams) => data)
  .handler(({ data }) => {
    const q = new URLSearchParams({ environment_id: data.environmentId })
    if (data.status) q.set("status", data.status)
    if (data.limit !== undefined) q.set("limit", String(data.limit))
    if (data.offset !== undefined) q.set("offset", String(data.offset))
    return serverRequest<ListIssuesResult>(
      "GET",
      `/api/projects/${data.projectId}/issues?${q}`,
    )
  })

export const getIssue = createServerFn({ method: "GET" })
  .validator((data: { issueId: string }) => data)
  .handler(({ data }) =>
    serverRequest<Issue>("GET", `/api/issues/${data.issueId}`),
  )

export const updateIssueStatus = createServerFn({ method: "POST" })
  .validator((data: { issueId: string; status: IssueStatus }) => data)
  .handler(({ data }) =>
    serverRequest<void>("PATCH", `/api/issues/${data.issueId}/status`, {
      status: data.status,
    }),
  )
