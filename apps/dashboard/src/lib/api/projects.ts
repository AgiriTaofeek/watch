import { createServerFn } from "@tanstack/react-start"
import { serverRequest } from "./server/request"
import type { Environment, IngestionKey, ProjectDetail } from "./types"

// The mutations below (createProject, createEnvironment, mintKey, revokeKey)
// throw ApiError intentionally: useMutation surfaces errors via mutation.isError,
// so a thrown error is the right contract. Note that ApiError loses its class
// and `status` when serialized across the RPC boundary — if a future screen
// needs to branch on a specific status code (e.g. 409 conflict on createProject),
// convert that function to return a Result via attempt() — see result.ts and
// how auth.ts handles login/setup. listProjects also throws; TanStack Query
// only needs an error value to enter its error state.

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
