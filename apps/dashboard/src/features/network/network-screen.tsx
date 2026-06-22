import { AlertCircle, FileX, Globe, Layers } from "lucide-react"
import { EmptyState } from "#/components/ui/empty-state"

export function NetworkScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Network</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Failed requests, asset load errors, and chunk load failures
        </p>
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SUMMARY_METRICS.map(({ label, icon: Icon }) => (
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

      {/* Failed requests */}
      <Section
        icon={AlertCircle}
        title="Failed requests"
        description="HTTP 4xx / 5xx and network errors by URL pattern — requires network request rollups"
        tall
      />

      {/* Asset failures */}
      <Section
        icon={FileX}
        title="Asset load failures"
        description="Failed script, stylesheet, font, and image loads — requires asset_load event rollups"
      />

      {/* Chunk errors */}
      <Section
        icon={Layers}
        title="Chunk load errors"
        description="JavaScript bundle load failures — requires chunk error rollups with deploy correlation"
      />

      <InfraNote text="Network failure data will appear once the aggregation worker begins processing network_request events and writing failure rollup rows." />
    </div>
  )
}

const SUMMARY_METRICS = [
  { label: "Failed requests", icon: AlertCircle },
  { label: "Failure rate", icon: Globe },
  { label: "Affected sessions", icon: Globe },
  { label: "Unique URLs failing", icon: FileX },
] as const

function Section({
  icon: Icon,
  title,
  description,
  tall,
}: {
  icon: typeof AlertCircle
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
      <EmptyState
        title="No data yet"
        description={description}
        className={tall ? "py-12" : "py-10"}
      />
    </div>
  )
}

function InfraNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{text}</p>
    </div>
  )
}
