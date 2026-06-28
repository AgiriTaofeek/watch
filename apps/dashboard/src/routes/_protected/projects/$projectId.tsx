import { useQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { useState } from "react"
import ThemeToggle from "#/components/theme-toggle"
import { Button } from "#/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet"
import { AppSidebar } from "#/features/shell/app-sidebar"
import { meQueryOptions, projectsQueryOptions } from "#/lib/api/queries"
import { NAV } from "#/lib/nav"

type ProjectSearch = { environment_id?: string }

export const Route = createFileRoute("/_protected/projects/$projectId")({
  validateSearch: (search): ProjectSearch => ({
    environment_id:
      typeof search.environment_id === "string"
        ? search.environment_id
        : undefined,
  }),
  beforeLoad: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(
      projectsQueryOptions(),
    )
    const project = projects.find((p) => p.id === params.projectId)
    if (!project) throw redirect({ to: "/" })
  },
  component: ProjectShell,
})

// Maps URL leaf segments to human-readable page labels for the breadcrumb.
const SEGMENT_LABELS = new Map<string, string>(
  NAV.flatMap((g) => g.items).map((item) => [item.segment, item.label]),
)

function usePageTitle(): string {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const segments = pathname.split("/")
  // Walk from end so issue detail (/issues/$id) resolves to "Issues".
  for (let i = segments.length - 1; i >= 0; i--) {
    const label = SEGMENT_LABELS.get(segments[i])
    if (label) return label
  }
  return ""
}

function ProjectShell() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const { data: user = null } = useQuery(meQueryOptions())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pageTitle = usePageTitle()

  const project = projects.find((p) => p.id === projectId)
  const environments = project?.environments ?? []
  const environmentId = environment_id ?? environments[0]?.id ?? ""

  const sidebarProps = {
    projectId,
    projects,
    environments,
    environmentId,
    user,
  }

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] md:grid-cols-[232px_1fr] md:grid-rows-1">
      {/* Desktop sidebar */}
      <aside className="hidden border-r bg-sidebar md:block">
        <AppSidebar {...sidebarProps} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-11.5 shrink-0 items-center gap-3 border-b bg-card px-5.5">
          {/* Mobile nav trigger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-58 p-0">
              <SheetTitle className="sr-only">Watch navigation</SheetTitle>
              <AppSidebar
                {...sidebarProps}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Breadcrumb */}
          {project && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm"
            >
              <span className="font-medium text-foreground">
                {project.name}
              </span>
              {pageTitle && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-muted-foreground">{pageTitle}</span>
                </>
              )}
            </nav>
          )}

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-6">
          {environments.length === 0 ? (
            <NoEnvironment projectId={projectId} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}

function NoEnvironment({ projectId }: { projectId: string }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-dashed p-8 text-center">
      <h2 className="text-lg font-semibold">No environment yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This project has no environments. Create one to start receiving data.
      </p>
      <Button asChild className="mt-4">
        <Link to="/projects/$projectId/settings" params={{ projectId }}>
          Go to settings
        </Link>
      </Button>
    </div>
  )
}
