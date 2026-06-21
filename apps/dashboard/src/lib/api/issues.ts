import { createServerFn } from "@tanstack/react-start"
import { serverRequest } from "./server/request"
import type { Issue, IssueStatus } from "./types"

// TODO(result-pattern): updateIssueStatus is a mutation that still throws
// ApiError, which loses its class and `status` across the RPC boundary. Before a
// screen branches on its status, convert it to return a Result via attempt() —
// see [result.ts](./result.ts). The reads (listIssues, getIssue) can keep
// throwing: TanStack Query only needs an error to surface, and the message
// survives serialization.

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
