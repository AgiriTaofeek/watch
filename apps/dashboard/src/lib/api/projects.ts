import { createServerFn } from "@tanstack/react-start"
import { serverRequest } from "./server/request"
import type { Environment, IngestionKey, ProjectDetail } from "./types"

// TODO(result-pattern): the mutations below (createProject, createEnvironment,
// mintKey, revokeKey) still throw ApiError. An ApiError thrown from a server
// function loses its class and `status` when serialized across the RPC boundary,
// so the client only sees a generic error. Harmless today (no UI callers), but
// before wiring a screen that must branch on status (e.g. createProject's 409 or
// revokeKey's 404), convert these to return a Result via attempt() — see
// [result.ts](./result.ts) and how auth.ts login/setup do it. The read
// (listProjects) can keep throwing: TanStack Query only needs an error to enter
// its error state, and the message survives.

export const listProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectDetail[]> => {
    const data = await serverRequest<{ projects: ProjectDetail[] }>(
      "GET",
      "/api/projects",
    )
    return data.projects
  },
)

export const createProject = createServerFn({ method: "POST" })
  .validator((data: { name: string; allowed_origins: string[] }) => data)
  .handler(({ data }) =>
    serverRequest<ProjectDetail>("POST", "/api/projects", data),
  )

export const createEnvironment = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; name: string }) => data)
  .handler(({ data }) =>
    serverRequest<Environment>(
      "POST",
      `/api/projects/${data.projectId}/environments`,
      { name: data.name },
    ),
  )

export const mintKey = createServerFn({ method: "POST" })
  .validator((data: { environmentId: string }) => data)
  .handler(({ data }) =>
    serverRequest<IngestionKey>(
      "POST",
      `/api/environments/${data.environmentId}/keys`,
    ),
  )

export const revokeKey = createServerFn({ method: "POST" })
  .validator((data: { keyId: string }) => data)
  .handler(({ data }) =>
    serverRequest<void>("DELETE", `/api/keys/${data.keyId}`),
  )
