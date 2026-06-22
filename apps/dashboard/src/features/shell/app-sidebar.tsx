import { Link } from "@tanstack/react-router"
import { Badge } from "#/components/ui/badge"
import { NAV } from "#/lib/nav"
import { cn } from "#/lib/utils.ts"

// Project-scoped sidebar navigation. Links preserve the environment_id search
// param so switching screens keeps the selected environment. The active item is
// derived by TanStack Router (activeProps) from the URL.
export function AppSidebar({
  projectId,
  onNavigate,
}: {
  projectId: string
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6 p-3">
      {NAV.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.group}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.segment}
                to={`/projects/$projectId/${item.segment}`}
                params={{ projectId }}
                search={(prev) => prev}
                onClick={onNavigate}
                aria-disabled={item.soon}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                activeProps={{
                  className: "bg-sidebar-accent text-sidebar-accent-foreground",
                }}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.soon && (
                  <Badge variant="secondary" className="text-[10px]">
                    soon
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
