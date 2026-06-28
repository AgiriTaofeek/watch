import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, Search } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useLogout } from "#/features/auth/use-logout"
import type { EnvironmentDetail, ProjectDetail, User } from "#/lib/api"
import { NAV, type ScreenSegment } from "#/lib/nav"
import { cn } from "#/lib/utils.ts"

function getInitials(user: User): string {
  const name = user.display_name ?? user.email
  const parts = name.split(/[\s@]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Project-scoped sidebar. Owns the brand mark, search trigger, nav groups,
// context-block (project/env selectors), and account footer so the shell
// header can stay clean — breadcrumb only.
export function AppSidebar({
  projectId,
  projects,
  environments,
  environmentId,
  user,
  navCounts,
  onNavigate,
}: {
  projectId: string
  projects: ProjectDetail[]
  environments: EnvironmentDetail[]
  environmentId: string
  user: User | null
  navCounts?: Partial<Record<ScreenSegment, number>>
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const { handleLogout, pending: logoutPending } = useLogout()
  // Used to compute nav-dot visibility and icon opacity per item.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const pathSegments = pathname.split("/")
  // Segment at index 3: /projects/{projectId}/{segment}
  const activeSegment = pathSegments[3]

  const currentEnv = environments.find((e) => e.id === environmentId)
  const isProductionEnv = currentEnv?.name.toLowerCase() === "production"

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── sidebar-top ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-3 pb-2 pt-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1">
          <div
            className="sidebar-gradient sidebar-brand-shadow flex size-6.5 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
            aria-hidden
          >
            W
          </div>
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            Watch
          </span>
        </div>

        {/* Search trigger — opens command palette (future) */}
        <button
          type="button"
          className="flex h-[30px] w-full items-center gap-2 rounded-md border border-sidebar-border bg-muted/30 px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50"
          aria-label="Search"
          disabled
        >
          <Search className="size-3 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden select-none rounded border border-sidebar-border bg-muted/40 px-1 font-mono text-[10px] sm:inline-flex">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── nav ─────────────────────────────────────────────── */}
      <nav
        aria-label="Primary"
        className="flex flex-col gap-4 overflow-y-auto px-2 py-1"
      >
        {NAV.map((group) => (
          <div key={group.group} className="flex flex-col gap-0.5">
            <div className="px-2 pb-1 pt-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {group.group}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon
              const count = navCounts?.[item.segment]
              const isActive = activeSegment === item.segment
              return (
                <Link
                  key={item.segment}
                  to={`/projects/$projectId/${item.segment}`}
                  params={{ projectId }}
                  search={(prev) => prev}
                  onClick={onNavigate}
                  aria-disabled={item.soon}
                  className={cn(
                    "flex h-[34px] items-center gap-[7px] rounded-md px-[9px] text-[13px] font-medium text-muted-foreground transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    item.soon && "pointer-events-none opacity-60",
                  )}
                  activeProps={{
                    className:
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  }}
                >
                  {/* nav-dot: visible only when active */}
                  <span
                    className={cn(
                      "size-[5px] shrink-0 rounded-full bg-sidebar-primary transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <Icon
                    className={cn(
                      "size-[15px] shrink-0 transition-opacity",
                      isActive ? "opacity-100" : "opacity-65",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  {count != null && count > 0 ? (
                    <span className="rounded-full bg-destructive/15 px-1.5 text-[11px] font-semibold tabular-nums text-destructive">
                      {count}
                    </span>
                  ) : item.soon ? (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                      soon
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── ctx-block (project + environment) ───────────────── */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Project
        </p>
        <Select
          value={projectId}
          onValueChange={(id) =>
            navigate({
              to: "/projects/$projectId/overview",
              params: { projectId: id },
            })
          }
        >
          <SelectTrigger
            className={cn(
              "h-[30px] w-full justify-start gap-[7px] rounded-md border-0 bg-transparent px-2 shadow-none",
              "text-[13px] font-medium text-sidebar-foreground",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:ring-0",
              "[&>svg:last-child]:hidden",
            )}
            aria-label="Switch project"
          >
            <span className="size-[7px] shrink-0 rounded-full bg-amber-400" />
            <SelectValue />
            <ChevronsUpDown className="ml-auto size-3 shrink-0 text-muted-foreground" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {environments.length > 0 && (
          <>
            <p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Environment
            </p>
            <Select
              value={environmentId}
              onValueChange={(id) =>
                navigate({
                  to: ".",
                  search: (prev) => ({ ...prev, environment_id: id }),
                })
              }
            >
              <SelectTrigger
                className={cn(
                  "h-[30px] w-full justify-start gap-[7px] rounded-md border-0 bg-transparent px-2 shadow-none",
                  "text-[13px] font-medium text-sidebar-foreground",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:ring-0",
                  "[&>svg:last-child]:hidden",
                )}
                aria-label="Switch environment"
              >
                <span
                  className={cn(
                    "size-[7px] shrink-0 rounded-full",
                    isProductionEnv ? "bg-emerald-500" : "bg-amber-400",
                  )}
                />
                <SelectValue />
                <ChevronsUpDown className="ml-auto size-3 shrink-0 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* ── sidebar-foot (account row) ───────────────────────── */}
      {user && (
        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-3 py-3">
          <div
            className="sidebar-gradient flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            aria-hidden
          >
            {getInitials(user)}
          </div>
          <span className="flex-1 truncate text-[13px] font-medium text-sidebar-foreground">
            {user.display_name ?? user.email}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutPending}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
            aria-label="Log out"
          >
            <LogOut className="size-[13px]" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
