import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
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
import { LogoutButton } from "#/features/auth/logout-button"
import { AppSidebar } from "#/features/shell/app-sidebar"
import { EnvironmentSwitcher } from "#/features/shell/environment-switcher"
import { ProjectSwitcher } from "#/features/shell/project-switcher"
import { projectsQueryOptions } from "#/lib/api/queries"

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
    // Unknown project id in the URL → back to the resolver at the index.
    if (!project) throw redirect({ to: "/" })
  },
  component: ProjectShell,
})

function ProjectShell() {
  const { projectId } = Route.useParams()
  const { environment_id } = Route.useSearch()
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const project = projects.find((p) => p.id === projectId)
  const environments = project?.environments ?? []
  // The URL is authoritative; fall back to the first environment when absent.
  const environmentId = environment_id ?? environments[0]?.id ?? ""

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-1">
      {/* Desktop sidebar */}
      <aside className="hidden border-r bg-sidebar md:block">
        <div className="flex h-14 items-center px-5 font-semibold tracking-tight">
          Watch
        </div>
        <AppSidebar projectId={projectId} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
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
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="px-5 pt-5 font-semibold">Watch</SheetTitle>
              <AppSidebar
                projectId={projectId}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {project ? (
            <>
              <ProjectSwitcher projects={projects} projectId={projectId} />
              {environments.length > 0 && (
                <EnvironmentSwitcher
                  environments={environments}
                  environmentId={environmentId}
                />
              )}
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
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
