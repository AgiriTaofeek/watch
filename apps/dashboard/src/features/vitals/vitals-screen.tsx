import { useQuery } from "@tanstack/react-query"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  type VitalsHealth,
  VitalsHealthBadge,
} from "#/components/ui/vitals-health-badge"
import { getVitalRollups, type VitalMetric } from "#/lib/api"

const TimeSeriesChart = lazy(
  () => import("#/features/charts/time-series-chart"),
)

type MetricConfig = {
  fullName: string
  thresholds: { good: number; ni: number }
  format: (v: number) => string
}

const METRIC_CONFIG: Record<VitalMetric, MetricConfig> = {
  LCP: {
    fullName: "Largest Contentful Paint",
    thresholds: { good: 2500, ni: 4000 },
    format: (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
  },
  CLS: {
    fullName: "Cumulative Layout Shift",
    thresholds: { good: 0.1, ni: 0.25 },
    format: (v) => v.toFixed(3),
  },
  INP: {
    fullName: "Interaction to Next Paint",
    thresholds: { good: 200, ni: 500 },
    format: (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
  },
  FCP: {
    fullName: "First Contentful Paint",
    thresholds: { good: 1800, ni: 3000 },
    format: (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
  },
  TTFB: {
    fullName: "Time to First Byte",
    thresholds: { good: 800, ni: 1800 },
    format: (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
  },
}

const VITAL_METRICS: VitalMetric[] = ["LCP", "CLS", "INP", "FCP", "TTFB"]

function vitalHealth(metric: VitalMetric, p75: number): VitalsHealth {
  const { good, ni } = METRIC_CONFIG[metric].thresholds
  if (p75 <= good) return "good"
  if (p75 <= ni) return "needs-improvement"
  return "poor"
}

const RANGES = {
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

export function VitalsScreen({
  projectId,
  environmentId,
}: {
  projectId: string
  environmentId: string
}) {
  const [selected, setSelected] = useState<VitalMetric>("LCP")
  const [range, setRange] = useState<RangeKey>("7d")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: new Date(end.getTime() - RANGES[range].ms), to: end }
  }, [range])

  const queryOpts = (metric: VitalMetric) => ({
    queryKey: ["rollups", "vitals", projectId, environmentId, metric, range],
    queryFn: () =>
      getVitalRollups({ data: { projectId, metric, environmentId, from, to } }),
    enabled: !!environmentId,
  })

  // Five stable queries — one per metric.
  const lcpQ = useQuery(queryOpts("LCP"))
  const clsQ = useQuery(queryOpts("CLS"))
  const inpQ = useQuery(queryOpts("INP"))
  const fcpQ = useQuery(queryOpts("FCP"))
  const ttfbQ = useQuery(queryOpts("TTFB"))

  const allQueries = { LCP: lcpQ, CLS: clsQ, INP: inpQ, FCP: fcpQ, TTFB: ttfbQ }
  const activeQuery = allQueries[selected]
  const activeBuckets = activeQuery.data?.buckets ?? []

  const formatX = (iso: string) => {
    const d = new Date(iso)
    return range === "24h"
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Web Vitals</h1>
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

      {/* Metric selector tabs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {VITAL_METRICS.map((metric) => {
          const q = allQueries[metric]
          const latest = q.data?.buckets.at(-1)
          const health = latest ? vitalHealth(metric, latest.p75) : null
          const { format } = METRIC_CONFIG[metric]
          const isActive = selected === metric

          return (
            <button
              key={metric}
              type="button"
              onClick={() => setSelected(metric)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {metric}
                </span>
                {health && (
                  <VitalsHealthBadge
                    health={health}
                    className="px-1.5 py-0 text-[0.6rem]"
                  />
                )}
              </div>
              {q.isPending ? (
                <div className="h-6 w-14 animate-pulse rounded bg-muted" />
              ) : latest ? (
                <span className="text-lg font-bold tabular-nums leading-tight">
                  {format(latest.p75)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <span className="text-xs text-muted-foreground">p75</span>
            </button>
          )
        })}
      </div>

      {/* Chart for selected metric */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">
            {selected} — {METRIC_CONFIG[selected].fullName}
          </p>
          <p className="text-xs text-muted-foreground">
            p75 · {RANGES[range].label}
          </p>
        </div>
        <div className="p-4">
          {!mounted || activeQuery.isPending ? (
            <Skeleton className="h-60 w-full" />
          ) : activeQuery.isError ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p>Couldn't load chart.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => activeQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : activeBuckets.length === 0 ? (
            <div className="flex h-60 items-center justify-center">
              <EmptyState
                title="No data yet"
                description={`No ${selected} samples recorded in this window.`}
              />
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-60 w-full" />}>
              <TimeSeriesChart
                data={activeBuckets}
                xKey="period_start"
                formatX={formatX}
                formatY={(v) => METRIC_CONFIG[selected].format(v)}
                series={[{ key: "p75", label: "p75", color: "var(--chart-1)" }]}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* Recent buckets table */}
      {activeBuckets.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Recent buckets</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium uppercase tracking-wide">
                  Period
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wide">
                  p75
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wide">
                  Mean
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wide">
                  Samples
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">
                  Health
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...activeBuckets]
                .reverse()
                .slice(0, 10)
                .map((bucket) => {
                  const { format } = METRIC_CONFIG[selected]
                  return (
                    <TableRow key={bucket.period_start}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(bucket.period_start).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {format(bucket.p75)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {format(bucket.mean)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {bucket.sample_count.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <VitalsHealthBadge
                          health={vitalHealth(selected, bucket.p75)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
