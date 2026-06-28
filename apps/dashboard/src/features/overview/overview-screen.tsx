import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { IssueStatusBadge } from "#/components/ui/issue-status-badge"
import { MetricCard } from "#/components/ui/metric-card"
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
import {
  type ErrorBucket,
  getErrorRollups,
  getVitalRollups,
  listIssues,
  type VitalBucket,
} from "#/lib/api"
import { projectsQueryOptions } from "#/lib/api/queries"

const TimeSeriesChart = lazy(
  () => import("#/features/charts/time-series-chart"),
)

const RANGES = {
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

function lcpHealth(p75Ms: number): VitalsHealth {
  if (p75Ms < 2500) return "good"
  if (p75Ms < 4000) return "needs-improvement"
  return "poor"
}

function formatWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })
}

export function OverviewScreen({
  projectId,
  environmentId,
}: {
  projectId: string
  environmentId: string
}) {
  const [range, setRange] = useState<RangeKey>("24h")
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)
  const envName =
    project?.environments.find((e) => e.id === environmentId)?.name ?? ""
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

  const openIssues = useQuery({
    queryKey: ["issues", projectId, environmentId, "open", 0],
    queryFn: () =>
      listIssues({
        data: { projectId, environmentId, status: "open", limit: 5, offset: 0 },
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

  // Derived metrics from rollup data
  const totalErrors = errors.data?.reduce((s, b) => s + b.error_count, 0) ?? 0
  const totalSessions =
    errors.data?.reduce((s, b) => s + b.session_count, 0) ?? 0
  const peakErrors = errors.data
    ? Math.max(0, ...errors.data.map((b) => b.error_count))
    : 0
  const avgErrors =
    errors.data && errors.data.length > 0
      ? Math.round(totalErrors / errors.data.length)
      : 0

  const errorBucketsLoading = errors.isPending
  const vitalsLoading = vitals.isPending
  const issuesLoading = openIssues.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          {(project || envName) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[project?.name, envName, RANGES[range].label]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
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

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Error Events"
          value={errorBucketsLoading ? "" : totalErrors.toLocaleString()}
          loading={errorBucketsLoading}
        />
        <MetricCard
          label="Open Issues"
          value={
            issuesLoading ? "" : (openIssues.data?.total ?? 0).toLocaleString()
          }
          loading={issuesLoading}
        />
        <MetricCard
          label="LCP p75"
          value={
            vitalsLoading || !latestVital
              ? ""
              : latestVital.p75 >= 1000
                ? `${(latestVital.p75 / 1000).toFixed(1)}s`
                : `${Math.round(latestVital.p75)}ms`
          }
          loading={vitalsLoading}
          description={
            latestVital
              ? lcpHealth(latestVital.p75).replace("-", " ")
              : undefined
          }
        />
        <MetricCard
          label="Affected Sessions"
          value={errorBucketsLoading ? "" : totalSessions.toLocaleString()}
          loading={errorBucketsLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Error rollup chart */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-start justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">Error Rollup</p>
              <p className="text-xs text-muted-foreground">
                {RANGES[range].label} · hourly
              </p>
            </div>
            <Link
              to="/projects/$projectId/issues"
              params={{ projectId }}
              search={(prev) => prev}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View issues →
            </Link>
          </div>
          <div className="p-4">
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
          </div>
          {/* Chart summary stats */}
          {!errorBucketsLoading && totalErrors > 0 && (
            <div className="flex divide-x border-t">
              <ChartStat label="Peak/hr" value={peakErrors.toLocaleString()} />
              <ChartStat label="Total" value={totalErrors.toLocaleString()} />
              <ChartStat label="Avg/hr" value={avgErrors.toLocaleString()} />
            </div>
          )}
        </div>

        {/* LCP vitals chart */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-start justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                LCP — Largest Contentful Paint
              </p>
              <p className="text-xs text-muted-foreground">
                p75 · {RANGES[range].label}
              </p>
            </div>
          </div>
          <div className="p-4">
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
          </div>
          {/* Chart summary stats */}
          {!vitalsLoading && latestVital && (
            <div className="flex divide-x border-t">
              <ChartStat
                label="p75"
                value={
                  latestVital.p75 >= 1000
                    ? `${(latestVital.p75 / 1000).toFixed(1)}s`
                    : `${Math.round(latestVital.p75)}ms`
                }
              />
              <ChartStat
                label="Mean"
                value={
                  latestVital.mean >= 1000
                    ? `${(latestVital.mean / 1000).toFixed(1)}s`
                    : `${Math.round(latestVital.mean)}ms`
                }
              />
              <div className="flex flex-col items-center justify-center px-4 py-3">
                <VitalsHealthBadge health={lcpHealth(latestVital.p75)} />
                <span className="mt-1 text-xs text-muted-foreground">
                  Health
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent issues table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium">Recent Issues</p>
            <p className="text-xs text-muted-foreground">
              Most recently active open issues
            </p>
          </div>
          <Link
            to="/projects/$projectId/issues"
            params={{ projectId }}
            search={(prev) => prev}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {openIssues.data && openIssues.data.total > 0
              ? `View all ${openIssues.data.total} →`
              : "View issues →"}
          </Link>
        </div>

        {issuesLoading ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : openIssues.isError ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Couldn't load recent issues.
          </div>
        ) : openIssues.data && openIssues.data.issues.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <EmptyState
              title="No open issues"
              description="No grouped errors in this environment."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-xs font-medium uppercase tracking-wide">
                  Status
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">
                  Title
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">
                  Route
                </TableHead>
                <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                  Count
                </TableHead>
                <TableHead className="w-32 text-xs font-medium uppercase tracking-wide">
                  Last seen
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openIssues.data?.issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <IssueStatusBadge status={issue.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/projects/$projectId/issues/$issueId"
                      params={{ projectId, issueId: issue.id }}
                      className="text-sm font-medium hover:underline"
                    >
                      {issue.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {issue.culprit ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {issue.event_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatWhen(issue.last_seen_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <Skeleton className="h-60 w-full" />
}

function ChartStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

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
        <p>Couldn't load this chart.</p>
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
