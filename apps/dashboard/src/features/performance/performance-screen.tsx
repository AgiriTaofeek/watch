import { useQuery } from "@tanstack/react-query"
import { Clock, Navigation, Route } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import type { NavTiming } from "#/lib/api"
import { getNavSummary } from "#/lib/api"

const RANGES = {
  "24h": { label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

type NavType = "all" | "hard" | "spa"

type Props = { projectId: string; environmentId: string }

export function PerformanceScreen({ projectId, environmentId }: Props) {
  const [range, setRange] = useState<RangeKey>("7d")
  const [navType, setNavType] = useState<NavType>("all")

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: new Date(end.getTime() - RANGES[range].ms), to: end }
  }, [range])

  const { data, isPending } = useQuery({
    queryKey: ["rollups", "navigation", projectId, environmentId, range],
    queryFn: () =>
      getNavSummary({ data: { projectId, environmentId, from, to } }),
    enabled: !!environmentId,
  })

  const total = data?.total_sessions ?? 0
  const hard = data?.hard_nav_sessions ?? 0
  const spa = data?.spa_nav_sessions ?? 0
  const hardPct = total > 0 ? Math.round((hard / total) * 100) : 0
  const spaPct = total > 0 ? Math.round((spa / total) * 100) : 0

  const timing = data?.timing
  const routes = data?.routes ?? []

  const visibleRoutes =
    navType === "all" ? routes : routes.filter((r) => r.sessions > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Navigation timing, route-level load breakdown, and SPA vs hard-nav
            split
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

      {/* Navigation type split */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Navigation className="size-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Navigation type split</p>
          {!isPending && total > 0 && (
            <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <span className="text-primary">●</span> Hard {hardPct}%
              </span>
              <span>
                <span className="text-sky-400">●</span> SPA {spaPct}%
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2 p-4">
          {(
            [
              { key: "all", label: "All", count: total },
              { key: "hard", label: "Hard nav", count: hard },
              { key: "spa", label: "SPA nav", count: spa },
            ] as { key: NavType; label: string; count: number }[]
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setNavType(key)}
              className={`flex flex-col gap-0.5 rounded-lg border px-5 py-3 text-left transition-colors ${
                navType === key
                  ? "border-primary/40 bg-primary/5"
                  : "hover:bg-muted/40"
              }`}
            >
              <span
                className={`text-xl font-bold tabular-nums ${navType === key ? "text-primary" : "text-foreground"}`}
              >
                {label}
              </span>
              <span className="text-xs text-muted-foreground">
                {isPending ? "—" : `${count.toLocaleString()} sessions`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation timing waterfall */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Clock className="size-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Navigation timing waterfall</p>
          <span className="ml-auto text-xs text-muted-foreground">
            p75 · {RANGES[range].label}
          </span>
        </div>
        {timing && !isPending ? (
          <WaterfallChart timing={timing} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {isPending ? "Loading…" : "No navigation data for this period."}
          </p>
        )}
      </div>

      {/* Route timing table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Route className="size-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Route timings</p>
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
                FCP p75
              </TableHead>
              <TableHead className="w-22 text-right text-xs font-medium uppercase tracking-wide">
                LCP p75
              </TableHead>
              <TableHead className="w-22 text-right text-xs font-medium uppercase tracking-wide">
                TTFB p75
              </TableHead>
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wide">
                Health
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRoutes.map((row) => (
              <TableRow key={row.route}>
                <TableCell className="font-mono text-xs">{row.route}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {row.sessions.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {formatMs(row.fcp_p75)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums text-sm ${lcpColor(row.lcp_p75)}`}
                >
                  {formatMs(row.lcp_p75)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums text-sm ${ttfbColor(row.ttfb_p75)}`}
                >
                  {formatMs(row.ttfb_p75)}
                </TableCell>
                <TableCell>
                  <HealthBadge lcp={row.lcp_p75} ttfb={row.ttfb_p75} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isPending && visibleRoutes.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No route data for this time range.
          </p>
        )}
      </div>
    </div>
  )
}

const WATERFALL_SEGMENTS: {
  key: keyof NavTiming
  label: string
  color: string
}[] = [
  { key: "dns_p75", label: "DNS", color: "bg-violet-400" },
  { key: "tcp_p75", label: "TCP", color: "bg-indigo-400" },
  { key: "tls_p75", label: "TLS", color: "bg-sky-400" },
  { key: "ttfb_p75", label: "TTFB", color: "bg-amber-400" },
  { key: "fcp_p75", label: "FCP", color: "bg-emerald-400" },
  { key: "lcp_p75", label: "LCP", color: "bg-primary" },
  { key: "dom_p75", label: "DOM", color: "bg-rose-400" },
]

function WaterfallChart({ timing }: { timing: NavTiming }) {
  const max = Math.max(...WATERFALL_SEGMENTS.map((s) => timing[s.key]))
  if (max === 0) return null

  return (
    <div className="space-y-2 p-4">
      {WATERFALL_SEGMENTS.map(({ key, label, color }) => {
        const value = timing[key]
        const widthPct = max > 0 ? (value / max) * 100 : 0
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
              {label}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className={`h-full rounded ${color} transition-all`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="w-16 font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatMs(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function HealthBadge({ lcp, ttfb }: { lcp: number; ttfb: number }) {
  const poor = lcp > 4000 || ttfb > 1800
  const needs = lcp > 2500 || ttfb > 800
  if (poor)
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        Poor
      </span>
    )
  if (needs)
    return (
      <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-500">
        Needs work
      </span>
    )
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
      Good
    </span>
  )
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function lcpColor(ms: number) {
  if (ms > 4000) return "text-destructive"
  if (ms > 2500) return "text-warning"
  return ""
}

function ttfbColor(ms: number) {
  if (ms > 1800) return "text-destructive"
  if (ms > 800) return "text-warning"
  return ""
}
