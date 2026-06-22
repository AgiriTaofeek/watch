import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Skeleton } from "#/components/ui/skeleton"
import {
  type ErrorBucket,
  getErrorRollups,
  getVitalRollups,
  type VitalBucket,
} from "#/lib/api"

// Recharts is lazy-loaded so it stays out of the auth bundles (§9).
const TimeSeriesChart = lazy(
  () => import("#/features/charts/time-series-chart"),
)

const RANGES = {
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

export function OverviewScreen({
  projectId,
  environmentId,
}: {
  projectId: string
  environmentId: string
}) {
  const [range, setRange] = useState<RangeKey>("24h")
  // Render charts only after mount: Recharts needs the DOM and must not run during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: new Date(end.getTime() - RANGES[range].ms), to: end }
  }, [range])

  const errors = useQuery({
    queryKey: ["rollups", "errors", projectId, environmentId, range],
    queryFn: () =>
      getErrorRollups({ data: { projectId, environmentId, from, to } }),
    enabled: !!environmentId,
  })

  const vitals = useQuery({
    queryKey: ["rollups", "vitals", projectId, environmentId, "LCP", range],
    queryFn: () =>
      getVitalRollups({
        data: { projectId, metric: "LCP", environmentId, from, to },
      }),
    enabled: !!environmentId,
  })

  const formatX = (iso: string) => {
    const d = new Date(iso)
    return range === "24h"
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  const latestVital = vitals.data?.buckets.at(-1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-40" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartState
              mounted={mounted}
              query={errors}
              isEmpty={(d) => d.length === 0}
              emptyMessage="No errors recorded in this window."
            >
              {(data: ErrorBucket[]) => (
                <Suspense fallback={<ChartSkeleton />}>
                  <TimeSeriesChart
                    data={data}
                    xKey="period_start"
                    formatX={formatX}
                    formatY={(v) => String(Math.round(v))}
                    series={[
                      {
                        key: "error_count",
                        label: "Errors",
                        color: "var(--chart-5)",
                      },
                    ]}
                  />
                </Suspense>
              )}
            </ChartState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">LCP (p75)</CardTitle>
            {latestVital && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>p75 {Math.round(latestVital.p75)} ms</span>
                <span>mean {Math.round(latestVital.mean)} ms</span>
                <span>{latestVital.sample_count} samples</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <ChartState
              mounted={mounted}
              query={vitals}
              isEmpty={(d) => d.buckets.length === 0}
              emptyMessage="No LCP samples in this window."
            >
              {(data: { buckets: VitalBucket[] }) => (
                <Suspense fallback={<ChartSkeleton />}>
                  <TimeSeriesChart
                    data={data.buckets}
                    xKey="period_start"
                    formatX={formatX}
                    formatY={(v) => `${Math.round(v)} ms`}
                    series={[
                      { key: "p75", label: "p75", color: "var(--chart-1)" },
                    ]}
                  />
                </Suspense>
              )}
            </ChartState>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <Skeleton className="h-60 w-full" />
}

// Renders the right state for a chart query: skeleton while loading/pre-mount,
// an error state with retry, an empty state for zero buckets, else the chart.
function ChartState<T>({
  mounted,
  query,
  isEmpty,
  emptyMessage,
  children,
}: {
  mounted: boolean
  query: UseQueryResult<T>
  isEmpty: (data: T) => boolean
  emptyMessage: string
  children: (data: T) => React.ReactNode
}) {
  if (!mounted || query.isPending) return <ChartSkeleton />
  if (query.isError) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Couldn’t load this chart.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  if (isEmpty(query.data)) {
    return (
      <div className="flex h-60 items-center justify-center">
        <EmptyState title="No data yet" description={emptyMessage} />
      </div>
    )
  }
  return <>{children(query.data)}</>
}
