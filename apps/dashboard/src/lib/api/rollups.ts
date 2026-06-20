import { request } from "./client"
import type { ErrorBucket, VitalBucket, VitalMetric } from "./types"

export type RollupParams = {
  environmentId: string
  from?: Date
  to?: Date
}

export async function getErrorRollups(
  projectId: string,
  params: RollupParams,
): Promise<ErrorBucket[]> {
  const q = new URLSearchParams({ environment_id: params.environmentId })
  if (params.from) q.set("from", params.from.toISOString())
  if (params.to) q.set("to", params.to.toISOString())
  const data = await request<{ buckets: ErrorBucket[] }>(
    "GET",
    `/api/projects/${projectId}/rollups/errors?${q}`,
  )
  return data.buckets
}

export async function getVitalRollups(
  projectId: string,
  metric: VitalMetric,
  params: RollupParams,
): Promise<{ metric: VitalMetric; buckets: VitalBucket[] }> {
  const q = new URLSearchParams({
    environment_id: params.environmentId,
    metric,
  })
  if (params.from) q.set("from", params.from.toISOString())
  if (params.to) q.set("to", params.to.toISOString())
  return request("GET", `/api/projects/${projectId}/rollups/vitals?${q}`)
}
