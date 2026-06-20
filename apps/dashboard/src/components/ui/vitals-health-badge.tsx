import type * as React from "react"

import { cn } from "#/lib/utils.ts"

export type VitalsHealth = "good" | "needs-improvement" | "poor"

const healthConfig: Record<VitalsHealth, { label: string; className: string }> =
  {
    good: {
      label: "Good",
      className:
        "bg-success/15 text-success border-success/20 dark:bg-success/10 dark:text-success",
    },
    "needs-improvement": {
      label: "Needs improvement",
      className:
        "bg-warning/15 text-warning border-warning/20 dark:bg-warning/10 dark:text-warning",
    },
    poor: {
      label: "Poor",
      className:
        "bg-destructive/15 text-destructive border-destructive/20 dark:bg-destructive/10 dark:text-destructive",
    },
  }

interface VitalsHealthBadgeProps extends React.ComponentProps<"span"> {
  health: VitalsHealth
}

function VitalsHealthBadge({
  health,
  className,
  ...props
}: VitalsHealthBadgeProps) {
  const { label, className: healthClass } = healthConfig[health]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        healthClass,
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { VitalsHealthBadge }
