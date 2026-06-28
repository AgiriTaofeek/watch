import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Database,
  LayoutDashboard,
  type Server,
  Zap,
} from "lucide-react"
import type { SystemHealth } from "#/lib/api"
import { getSystemHealth } from "#/lib/api"

type ServiceStatus = "healthy" | "elevated" | "degraded" | "unknown"

const STATUS_CONFIG: Record<
  ServiceStatus,
  {
    label: string
    icon: typeof CheckCircle2
    dotClass: string
    textClass: string
  }
> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-500",
  },
  elevated: {
    label: "Elevated",
    icon: AlertTriangle,
    dotClass: "bg-amber-400",
    textClass: "text-amber-500",
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    dotClass: "bg-destructive",
    textClass: "text-destructive",
  },
  unknown: {
    label: "Unknown",
    icon: Circle,
    dotClass: "bg-muted-foreground/40",
    textClass: "text-muted-foreground",
  },
}

function toStatus(s: string): ServiceStatus {
  if (s === "healthy" || s === "elevated" || s === "degraded") return s
  return "unknown"
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const { label, icon: Icon, textClass } = STATUS_CONFIG[status]
  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${textClass}`}
    >
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}

function ServiceCard({
  icon: Icon,
  title,
  status,
  stats,
}: {
  icon: typeof Server
  title: string
  status: ServiceStatus
  stats: { label: string; value: string }[]
}) {
  const { dotClass } = STATUS_CONFIG[status]
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`size-2.25 shrink-0 rounded-full ${dotClass}`}
            aria-hidden
          />
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value }) => (
          <div key={label}>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SystemHealthScreen() {
  const { data, isPending } = useQuery({
    queryKey: ["system", "health"],
    queryFn: () => getSystemHealth(),
    refetchInterval: 30_000,
  })

  const d = data as SystemHealth | undefined
  const _ = (v: string | number | undefined, fallback = "—") =>
    isPending || v == null ? fallback : String(v)

  const dbStatus = toStatus(d?.database.status ?? "unknown")
  const pct = d
    ? d.database.max > 0
      ? Math.round((d.database.connections / d.database.max) * 100)
      : 0
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System Health</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ingestion pipeline, worker queue, database, and dashboard API status
        </p>
      </div>

      {/* Service status cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ServiceCard
          icon={Zap}
          title="Ingestion API"
          status={toStatus(d?.ingestion.status ?? "unknown")}
          stats={[
            { label: "Events/min", value: _(d?.ingestion.events_per_min) },
            {
              label: "Avg latency",
              value: d?.ingestion.avg_latency_ms
                ? `${d.ingestion.avg_latency_ms}ms`
                : "—",
            },
            {
              label: "Uptime (30d)",
              value: d?.ingestion.uptime_pct
                ? `${d.ingestion.uptime_pct}%`
                : "—",
            },
          ]}
        />
        <ServiceCard
          icon={Activity}
          title="Aggregation Worker"
          status={toStatus(d?.worker.status ?? "unknown")}
          stats={[
            { label: "Queue depth", value: _(d?.worker.queue_depth) },
            { label: "Rollups today", value: _(d?.worker.rollups_today) },
            {
              label: "Last run",
              value: d?.worker.last_run_at
                ? formatRelative(d.worker.last_run_at)
                : "—",
            },
          ]}
        />
        <ServiceCard
          icon={Database}
          title="Database"
          status={dbStatus}
          stats={[
            {
              label: "Connections",
              value: d ? `${d.database.connections} / ${d.database.max}` : "—",
            },
            { label: "Pool usage", value: pct != null ? `${pct}%` : "—" },
            { label: "Idle", value: _(d?.database.idle) },
          ]}
        />
        <ServiceCard
          icon={LayoutDashboard}
          title="Dashboard API"
          status="healthy"
          stats={[
            { label: "Version", value: _(d?.server.version) },
            { label: "Go version", value: _(d?.server.go_version) },
            { label: "Uptime", value: _(d?.server.uptime_human) },
          ]}
        />
      </div>

      {/* Dropped events */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Dropped events</p>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </div>
        <div className="divide-y">
          {DROP_REASONS.map(({ reason }) => (
            <div
              key={reason}
              className="grid grid-cols-[1fr_auto_64px] items-center gap-2.5 px-4 py-2.5"
            >
              <span className="text-sm text-muted-foreground">{reason}</span>
              <span className="text-sm font-semibold tabular-nums">0</span>
              <span className="text-right text-xs text-muted-foreground">
                —
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Server info */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Server info</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr]">
          {[
            { key: "Watch version", value: _(d?.server.version) },
            { key: "Go version", value: _(d?.server.go_version) },
            {
              key: "Uptime",
              value: d?.server.uptime_human
                ? `${d.server.uptime_human} (${d.server.uptime_seconds}s)`
                : "—",
            },
          ].map(({ key, value }) => (
            <>
              <dt
                key={`k-${key}`}
                className="border-b px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground last:border-b-0"
              >
                {key}
              </dt>
              <dd
                key={`v-${key}`}
                className="border-b px-4 py-2.5 font-mono text-[11px] text-foreground/80 last:border-b-0"
              >
                {value}
              </dd>
            </>
          ))}
        </dl>
      </div>
    </div>
  )
}

const DROP_REASONS = [
  { reason: "Rate limit exceeded" },
  { reason: "Schema validation error" },
  { reason: "Invalid ingestion key" },
  { reason: "Payload too large" },
] as const

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
