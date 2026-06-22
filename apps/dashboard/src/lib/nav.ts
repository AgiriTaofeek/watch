import {
  Activity,
  AlertCircle,
  Clock,
  GitBranch,
  Globe,
  LayoutGrid,
  type LucideIcon,
  Server,
  Settings,
} from "lucide-react"

// Project-scoped navigation. `to` is the child segment under
// /_protected/projects/$projectId. Items flagged `soon` route to a screen that
// is intentionally deferred past M6 (see docs/milestone-6/README.md §13) — they
// stay visible to match the design but render a "coming soon" placeholder.
// Literal union so `/projects/$projectId/${segment}` is a typed route path,
// not a loose string — keeps TanStack Router's typed <Link to> happy.
export type ScreenSegment =
  | "overview"
  | "issues"
  | "vitals"
  | "performance"
  | "network"
  | "route-health"
  | "system-health"
  | "settings"

export type NavItem = {
  segment: ScreenSegment
  label: string
  icon: LucideIcon
  soon?: boolean
}

export type NavGroup = {
  group: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    group: "Monitor",
    items: [
      { segment: "overview", label: "Overview", icon: LayoutGrid },
      { segment: "issues", label: "Issues", icon: AlertCircle },
      { segment: "vitals", label: "Web Vitals", icon: Activity },
      { segment: "performance", label: "Performance", icon: Clock, soon: true },
      { segment: "network", label: "Network", icon: Globe, soon: true },
      {
        segment: "route-health",
        label: "Route Health",
        icon: GitBranch,
        soon: true,
      },
    ],
  },
  {
    group: "System",
    items: [
      { segment: "system-health", label: "System Health", icon: Server },
      { segment: "settings", label: "Settings", icon: Settings },
    ],
  },
]
