import type * as React from "react"

import { cn } from "#/lib/utils.ts"

export type IssueStatus = "open" | "resolved" | "ignored"

const statusConfig: Record<IssueStatus, { label: string; className: string }> =
  {
    open: {
      label: "Open",
      className:
        "bg-info/15 text-info border-info/20 dark:bg-info/10 dark:text-info",
    },
    resolved: {
      label: "Resolved",
      className:
        "bg-success/15 text-success border-success/20 dark:bg-success/10 dark:text-success",
    },
    ignored: {
      label: "Ignored",
      className: "bg-muted text-muted-foreground border-border",
    },
  }

interface IssueStatusBadgeProps extends React.ComponentProps<"span"> {
  status: IssueStatus
}

function IssueStatusBadge({
  status,
  className,
  ...props
}: IssueStatusBadgeProps) {
  const { label, className: statusClass } = statusConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        statusClass,
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { IssueStatusBadge }
