import { request } from "./client"
import type { Environment, IngestionKey, ProjectDetail } from "./types"

export async function listProjects(): Promise<ProjectDetail[]> {
  const data = await request<{ projects: ProjectDetail[] }>(
    "GET",
    "/api/projects",
  )
  return data.projects
}

export async function createProject(input: {
  name: string
  allowed_origins: string[]
}): Promise<ProjectDetail> {
  return request<ProjectDetail>("POST", "/api/projects", input)
}

export async function createEnvironment(
  projectId: string,
  name: string,
): Promise<Environment> {
  return request<Environment>(
    "POST",
    `/api/projects/${projectId}/environments`,
    { name },
  )
}

export async function mintKey(environmentId: string): Promise<IngestionKey> {
  return request<IngestionKey>(
    "POST",
    `/api/environments/${environmentId}/keys`,
  )
}

export async function revokeKey(keyId: string): Promise<void> {
  return request<void>("DELETE", `/api/keys/${keyId}`)
}
