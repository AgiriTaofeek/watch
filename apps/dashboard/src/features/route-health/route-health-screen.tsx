import { useQuery } from "@tanstack/react-query"
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Route,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import type { RouteSummary } from "#/lib/api"
import { getRouteRollups } from "#/lib/api"

const RANGES = {
  "24h": { label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

type Props = { projectId: string; environmentId: string }

export function RouteHealthScreen({ projectId, environmentId }: Props) {
  const [range, setRange] = useState<RangeKey>("7d")
  const [expanded, setExpanded] = useState<string | null>(null)

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: new Date(end.getTime() - RANGES[range].ms), to: end }
  }, [range])

  const { data, isPending } = useQuery({
    queryKey: ["rollups", "routes", projectId, environmentId, range],
    queryFn: () =>
      getRouteRollups({ data: { projectId, environmentId, from, to } }),
    enabled: !!environmentId,
  })

  const routes = data?.routes ?? []
  const summary = data ?? {
    overall_health: 0,
    route_count: 0,
    poor_health_count: 0,
    avg_error_rate: 0,
  }

  function toggleRow(route: string) {
    setExpanded(expanded === route ? null : route)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Route Health</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Composite health score per route — errors, vitals, and network
            failures combined
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {(Object.keys(RANGES) as RangeKey[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {RANGES[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Overall health score"
          icon={BarChart3}
          value={isPending ? "—" : String(summary.overall_health)}
          valueClass={healthScoreColor(summary.overall_health)}
          sub="/100"
        />
        <SummaryCard
          label="Routes tracked"
          icon={Route}
          value={isPending ? "—" : String(summary.route_count)}
        />
        <SummaryCard
          label="Routes in poor health"
          icon={TrendingDown}
          value={isPending ? "—" : String(summary.poor_health_count)}
          valueClass={
            summary.poor_health_count > 0 ? "text-destructive" : undefined
          }
        />
        <SummaryCard
          label="Avg error rate"
          icon={TrendingUp}
          value={
            isPending ? "—" : `${(summary.avg_error_rate * 100).toFixed(1)}%`
          }
          valueClass={
            summary.avg_error_rate > 0.05
              ? "text-destructive"
              : summary.avg_error_rate > 0.02
                ? "text-warning"
                : undefined
          }
        />
      </div>

      {/* Route health table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Route className="size-3.5 text-muted-foreground" />
            <p className="text-sm font-medium">Route health table</p>
          </div>
          <span className="text-xs text-muted-foreground">
            Click a row to expand
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-medium uppercase tracking-wide">
                Route
              </TableHead>
              <TableHead className="w-18 text-right text-xs font-medium uppercase tracking-wide">
                Sessions
              </TableHead>
              <TableHead className="w-22 text-right text-xs font-medium uppercase tracking-wide">
                Errors
              </TableHead>
              <TableHead className="w-22 text-right text-xs font-medium uppercase tracking-wide">
                Error rate
              </TableHead>
              <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                LCP p75
              </TableHead>
              <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                INP p75
              </TableHead>
              <TableHead className="w-35 text-xs font-medium uppercase tracking-wide">
                Health score
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((row) => (
              <>
                <TableRow
                  key={row.route}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => toggleRow(row.route)}
                >
                  <TableCell className="font-mono text-xs">
                    <span className="flex items-center gap-1.5">
                      {expanded === row.route ? (
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      {row.route}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.sessions.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.errors.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${errorRateColor(row.error_rate)}`}
                  >
                    {(row.error_rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${lcpColor(row.lcp_p75)}`}
                  >
                    {formatMs(row.lcp_p75)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm ${inpColor(row.inp_p75)}`}
                  >
                    {formatMs(row.inp_p75)}
                  </TableCell>
                  <TableCell>
                    <ScoreBar score={row.health_score} />
                  </TableCell>
                </TableRow>
                {expanded === row.route && (
                  <TableRow key={`${row.route}-detail`}>
                    <TableCell colSpan={7} className="bg-muted/20 p-0">
                      <RouteDetail row={row} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
        {!isPending && routes.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No route data for this time range.
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  icon: Icon,
  value,
  valueClass,
  sub,
}: {
  label: string
  icon: typeof BarChart3
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <span
        className={`text-2xl font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}
      >
        {value}
        {sub && (
          <span className="ml-0.5 text-sm font-normal text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 60
        ? "bg-amber-400"
        : "bg-destructive"
  const textColor =
    score >= 80
      ? "text-emerald-500"
      : score >= 60
        ? "text-amber-400"
        : "text-destructive"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-18 rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span
        className={`w-7 text-right text-xs font-bold tabular-nums ${textColor}`}
      >
        {score}
      </span>
    </div>
  )
}

function RouteDetail({ row }: { row: RouteSummary }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-8 py-4 sm:grid-cols-6">
      <DetailStat label="FCP p75" value={formatMs(row.fcp_p75)} />
      <DetailStat label="CLS p75" value={row.cls_p75.toFixed(3)} />
      <DetailStat label="TTFB p75" value={formatMs(row.ttfb_p75)} />
      <DetailStat label="Sessions" value={row.sessions.toLocaleString()} />
      <DetailStat label="Errors" value={row.errors.toLocaleString()} />
      <DetailStat
        label="Error rate"
        value={`${(row.error_rate * 100).toFixed(1)}%`}
        valueClass={errorRateColor(row.error_rate)}
      />
    </div>
  )
}

function DetailStat({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  )
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function healthScoreColor(score: number) {
  if (score >= 80) return "text-emerald-500"
  if (score >= 60) return "text-amber-400"
  return "text-destructive"
}

function errorRateColor(rate: number) {
  if (rate > 0.05) return "text-destructive"
  if (rate > 0.02) return "text-warning"
  return ""
}

function lcpColor(ms: number) {
  if (ms > 4000) return "text-destructive"
  if (ms > 2500) return "text-warning"
  return ""
}

function inpColor(ms: number) {
  if (ms > 500) return "text-destructive"
  if (ms > 200) return "text-warning"
  return ""
}
