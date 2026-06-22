import { BarChart3, Route, TrendingUp } from "lucide-react"
import { EmptyState } from "#/components/ui/empty-state"

export function RouteHealthScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Route Health</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Composite health score per route — errors, vitals, and network
          failures combined
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          { label: "Overall health score", icon: BarChart3 },
          { label: "Routes tracked", icon: Route },
          { label: "Routes in poor health", icon: TrendingUp },
        ].map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </div>
            <span className="text-2xl font-semibold tabular-nums text-muted-foreground/50">
              —
            </span>
          </div>
        ))}
      </div>

      {/* Route health table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Route className="size-3.5 text-muted-foreground" />
            <p className="text-sm font-medium">Route health table</p>
          </div>
        </div>
        <EmptyState
          title="No route health data"
          description="Per-route composite scoring requires error rollups, vital rollups, and network failure rollups joined at the route level — backend support not yet implemented."
          className="py-16"
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <BarChart3 className="mt-0.5 size-4 shrink-0" />
        <p>
          Route health scores will appear once the aggregation worker correlates
          error counts, web vital p75 values, and network failure rates per
          route into a 0–100 health score.
        </p>
      </div>
    </div>
  )
}
