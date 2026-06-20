import { request } from "./client"
import type { Issue, IssueStatus } from "./types"

export type ListIssuesParams = {
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

export async function listIssues(
  projectId: string,
  params: ListIssuesParams,
): Promise<ListIssuesResult> {
  const q = new URLSearchParams({ environment_id: params.environmentId })
  if (params.status) q.set("status", params.status)
  if (params.limit !== undefined) q.set("limit", String(params.limit))
  if (params.offset !== undefined) q.set("offset", String(params.offset))
  return request<ListIssuesResult>(
    "GET",
    `/api/projects/${projectId}/issues?${q}`,
  )
}

export async function getIssue(issueId: string): Promise<Issue> {
  return request<Issue>("GET", `/api/issues/${issueId}`)
}

export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
): Promise<void> {
  return request<void>("PATCH", `/api/issues/${issueId}/status`, { status })
}
