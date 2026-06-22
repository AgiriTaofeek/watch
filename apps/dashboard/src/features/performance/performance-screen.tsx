import { Activity, Clock, Navigation, Route } from "lucide-react"
import { EmptyState } from "#/components/ui/empty-state"

export function PerformanceScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Navigation timing, route-level load breakdown, and SPA vs hard-nav
          split
        </p>
      </div>

      {/* Navigation type split */}
      <Section
        icon={Navigation}
        title="Navigation type split"
        description="Hard navigations vs SPA client-side transitions — requires navigation timing rollups"
      />

      {/* Timing waterfall */}
      <Section
        icon={Clock}
        title="Navigation timing waterfall"
        description="DNS · TCP · TLS · Request/TTFB · Response · DOM parse · FCP · LCP — requires navigation timing rollups"
      />

      {/* Route timing table */}
      <Section
        icon={Route}
        title="Route timing"
        description="Per-route FCP, LCP, TTFB, and load p75 — requires route-level navigation rollups"
        tall
      />

      <InfraNote
        icon={Activity}
        text="Navigation timing data will appear once the aggregation worker begins processing navigation events and writing rollup rows."
      />
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  description,
  tall,
}: {
  icon: typeof Activity
  title: string
  description: string
  tall?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">{title}</p>
        </div>
      </div>
      <div className={tall ? "py-4" : ""}>
        <EmptyState
          title="No data yet"
          description={description}
          className={tall ? "py-12" : "py-10"}
        />
      </div>
    </div>
  )
}

function InfraNote({
  icon: Icon,
  text,
}: {
  icon: typeof Activity
  text: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{text}</p>
    </div>
  )
}
