import { TrendingDown, TrendingUp } from "lucide-react"
import type * as React from "react"

import { cn } from "#/lib/utils.ts"
import { Card, CardContent, CardHeader } from "./card"

type Trend = "up" | "down" | "neutral"

interface MetricCardProps extends React.ComponentProps<typeof Card> {
  label: string
  value: string | number
  unit?: string
  trend?: Trend
  trendLabel?: string
  description?: string
  loading?: boolean
}

const trendConfig: Record<
  Trend,
  { icon: typeof TrendingUp | null; className: string }
> = {
  up: { icon: TrendingUp, className: "text-destructive" },
  down: { icon: TrendingDown, className: "text-success" },
  neutral: { icon: null, className: "text-muted-foreground" },
}

function MetricCard({
  label,
  value,
  unit,
  trend,
  trendLabel,
  description,
  loading,
  className,
  ...props
}: MetricCardProps) {
  const trendCfg = trend ? trendConfig[trend] : null
  const TrendIcon = trendCfg?.icon ?? null

  return (
    <Card className={cn("gap-3 py-5", className)} {...props}>
      <CardHeader className="px-5 pb-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
      </CardHeader>
      <CardContent className="px-5">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums leading-none">
              {value}
            </span>
            {unit && (
              <span className="text-sm text-muted-foreground">{unit}</span>
            )}
          </div>
        )}
        {(trendCfg || description) && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {TrendIcon && (
              <TrendIcon
                className={cn("size-3.5", trendCfg?.className)}
                aria-hidden
              />
            )}
            {trendLabel && (
              <span className={trendCfg?.className}>{trendLabel}</span>
            )}
            {description && <span>{description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export type { Trend }
export { MetricCard }
