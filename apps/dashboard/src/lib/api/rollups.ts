import { createServerFn } from "@tanstack/react-start"
import { serverRequest } from "./server/request"
import type { ErrorBucket, VitalBucket, VitalMetric } from "./types"

// Reads only. These throw ApiError on failure, which is fine for TanStack Query —
// it just needs an error to enter its error state, and the message survives the
// RPC boundary. No Result needed unless a caller must branch on the HTTP status
// (then see [result.ts](./result.ts) and the auth.ts pattern).

export type RollupParams = {
  environmentId: string
  from?: Date
  to?: Date
}

// The server-fn RPC boundary may deliver dates as ISO strings; normalize either.
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export const getErrorRollups = createServerFn({ method: "GET" })
  .validator((data: { projectId: string } & RollupParams) => data)
  .handler(async ({ data }) => {
    const q = new URLSearchParams({ environment_id: data.environmentId })
    if (data.from) q.set("from", toIso(data.from))
    if (data.to) q.set("to", toIso(data.to))
    const result = await serverRequest<{ buckets: ErrorBucket[] }>(
      "GET",
      `/api/projects/${data.projectId}/rollups/errors?${q}`,
    )
    return result.buckets
  })

export const getVitalRollups = createServerFn({ method: "GET" })
  .validator(
    (data: { projectId: string; metric: VitalMetric } & RollupParams) => data,
  )
  .handler(({ data }) => {
    const q = new URLSearchParams({
      environment_id: data.environmentId,
      metric: data.metric,
    })
    if (data.from) q.set("from", toIso(data.from))
    if (data.to) q.set("to", toIso(data.to))
    return serverRequest<{ metric: VitalMetric; buckets: VitalBucket[] }>(
      "GET",
      `/api/projects/${data.projectId}/rollups/vitals?${q}`,
    )
  })
