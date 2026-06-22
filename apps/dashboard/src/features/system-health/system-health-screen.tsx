import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Database,
  LayoutDashboard,
  Server,
  Zap,
} from "lucide-react"
import { EmptyState } from "#/components/ui/empty-state"

type ServiceStatus = "healthy" | "elevated" | "degraded" | "unknown"

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    className: "text-success",
  },
  elevated: {
    label: "Elevated",
    icon: AlertTriangle,
    className: "text-warning",
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    className: "text-destructive",
  },
  unknown: {
    label: "Unknown",
    icon: Circle,
    className: "text-muted-foreground",
  },
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const { label, icon: Icon, className } = STATUS_CONFIG[status]
  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${className}`}
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
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value }) => (
          <div key={label}>
            <p className="text-lg font-semibold tabular-nums text-muted-foreground/50">
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SystemHealthScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System Health</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ingestion pipeline, worker queue, database, and dashboard API status
        </p>
      </div>

      {/* Service status cards — shown as "unknown" until a health endpoint exists */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ServiceCard
          icon={Zap}
          title="Ingestion API"
          status="unknown"
          stats={[
            { label: "Events/min", value: "—" },
            { label: "Avg latency", value: "—" },
            { label: "Uptime (30d)", value: "—" },
            { label: "Errors", value: "—" },
          ]}
        />
        <ServiceCard
          icon={Activity}
          title="Aggregation Worker"
          status="unknown"
          stats={[
            { label: "Queue depth", value: "—" },
            { label: "Rollups today", value: "—" },
            { label: "Cycle interval", value: "5 min" },
            { label: "Last run", value: "—" },
          ]}
        />
        <ServiceCard
          icon={Database}
          title="Database"
          status="unknown"
          stats={[
            { label: "Connections", value: "—" },
            { label: "Write p75", value: "—" },
            { label: "Slow queries", value: "—" },
            { label: "Pool capacity", value: "—" },
          ]}
        />
        <ServiceCard
          icon={LayoutDashboard}
          title="Dashboard API"
          status="unknown"
          stats={[
            { label: "Active sessions", value: "—" },
            { label: "Avg response", value: "—" },
            { label: "Auth errors", value: "—" },
            { label: "Cache hit rate", value: "—" },
          ]}
        />
      </div>

      {/* Ingestion rate chart placeholder */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Ingestion rate</p>
          <p className="text-xs text-muted-foreground">
            Events per minute · last 2 hours
          </p>
        </div>
        <EmptyState
          title="No telemetry data"
          description="Ingestion rate telemetry requires an internal metrics endpoint — not yet implemented."
          className="py-12"
        />
      </div>

      {/* Dropped events */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Dropped events</p>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </div>
        <EmptyState
          title="No drop data"
          description="Dropped event counters require an internal metrics endpoint — not yet implemented."
          className="py-10"
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Server className="mt-0.5 size-4 shrink-0" />
        <p>
          System health data requires a{" "}
          <code className="font-mono text-xs">GET /api/system/health</code>{" "}
          endpoint that exposes ingestion throughput, worker queue depth,
          database connection pool stats, and dropped event counters.
        </p>
      </div>
    </div>
  )
}
