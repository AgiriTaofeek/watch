import { useQuery } from "@tanstack/react-query"
import { Activity, Globe } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { getNetworkRollups } from "#/lib/api"

const RANGES = {
  "24h": { label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
} as const
type RangeKey = keyof typeof RANGES

type SubTab = "failed" | "assets" | "chunks"

type Props = { projectId: string; environmentId: string }

export function NetworkScreen({ projectId, environmentId }: Props) {
  const [range, setRange] = useState<RangeKey>("7d")
  const [subTab, setSubTab] = useState<SubTab>("failed")

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: new Date(end.getTime() - RANGES[range].ms), to: end }
  }, [range])

  const { data: failures = [], isPending } = useQuery({
    queryKey: ["rollups", "network", projectId, environmentId, range],
    queryFn: () =>
      getNetworkRollups({ data: { projectId, environmentId, from, to } }),
    enabled: !!environmentId,
  })

  const totalFailures = failures.reduce((s, r) => s + r.failure_count, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Network</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Failed requests, asset load errors, and chunk load failures
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

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Total failures",
            value: isPending ? "—" : totalFailures.toLocaleString(),
          },
          {
            label: "Unique patterns",
            value: isPending ? "—" : String(failures.length),
          },
          {
            label: "Highest fail rate",
            value: isPending
              ? "—"
              : failures.length > 0
                ? `${(Math.max(...failures.map((f) => f.fail_rate)) * 100).toFixed(1)}%`
                : "0%",
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Sub-tab card */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Globe className="size-3.5 text-muted-foreground" />
            <p className="text-sm font-medium">Request analysis</p>
          </div>
        </div>

        {/* Sub-tab bar */}
        <div className="flex gap-1 border-b bg-muted/30 px-4 py-2">
          {(
            [
              {
                key: "failed",
                label: "Failed requests",
                count: failures.length,
              },
              { key: "assets", label: "Asset failures", count: 0 },
              { key: "chunks", label: "Chunk errors", count: 0 },
            ] as { key: SubTab; label: string; count: number }[]
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                subTab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {count > 0 && (
                <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {subTab === "failed" && (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-xs font-medium uppercase tracking-wide">
                    Method
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">
                    URL pattern
                  </TableHead>
                  <TableHead className="w-16 text-xs font-medium uppercase tracking-wide">
                    Status
                  </TableHead>
                  <TableHead className="w-18 text-right text-xs font-medium uppercase tracking-wide">
                    Failures
                  </TableHead>
                  <TableHead className="w-18 text-right text-xs font-medium uppercase tracking-wide">
                    Sessions
                  </TableHead>
                  <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                    Fail rate
                  </TableHead>
                  <TableHead className="w-28 text-xs font-medium uppercase tracking-wide">
                    Last seen
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((row) => (
                  <TableRow
                    key={`${row.method}-${row.url_pattern}-${row.status_code}`}
                  >
                    <TableCell>
                      <MethodBadge method={row.method} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      {row.url_pattern}
                    </TableCell>
                    <TableCell>
                      <StatusBadge code={row.status_code} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {row.failure_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {row.session_count.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums text-sm ${failRateColor(row.fail_rate)}`}
                    >
                      {(row.fail_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatRelative(row.last_seen_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isPending && failures.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No failed requests in this time range.
              </p>
            )}
          </div>
        )}

        {subTab === "assets" && (
          <EmptyTab
            icon={Activity}
            description="Asset load failures will appear once the SDK reports failed script, stylesheet, and image loads."
          />
        )}
        {subTab === "chunks" && (
          <EmptyTab
            icon={Activity}
            description="Chunk load errors will appear once the SDK captures ChunkLoadError events."
          />
        )}
      </div>
    </div>
  )
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-sky-500/10 text-sky-500",
    POST: "bg-emerald-500/10 text-emerald-500",
    PUT: "bg-amber-500/10 text-amber-500",
    PATCH: "bg-amber-500/10 text-amber-500",
    DELETE: "bg-destructive/10 text-destructive",
  }
  const cls = colors[method] ?? "bg-muted text-muted-foreground"
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${cls}`}
    >
      {method}
    </span>
  )
}

function StatusBadge({ code }: { code: number }) {
  const isError = code >= 400
  return (
    <Badge
      variant={isError ? "destructive" : "secondary"}
      className="font-mono text-[10px]"
    >
      {code}
    </Badge>
  )
}

function EmptyTab({
  icon: Icon,
  description,
}: {
  icon: typeof Activity
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Icon className="size-4 text-muted-foreground/50" />
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function failRateColor(rate: number) {
  if (rate > 0.1) return "text-destructive"
  if (rate > 0.05) return "text-warning"
  return ""
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
