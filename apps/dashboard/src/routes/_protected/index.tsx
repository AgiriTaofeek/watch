import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import ThemeToggle from "#/components/theme-toggle"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { LogoutButton } from "#/features/auth/logout-button"
import { CreateProjectForm } from "#/features/onboarding/create-project-form"
import { projectsQueryOptions } from "#/lib/api/queries"

// Entry point after login. The first project's overview is the real home, so
// resolve projects and redirect there. With no projects, show onboarding: create
// the first project, then go to its settings to copy the SDK DSN.
export const Route = createFileRoute("/_protected/")({
  beforeLoad: async ({ context }) => {
    const projects = await context.queryClient.ensureQueryData(
      projectsQueryOptions(),
    )
    const first = projects[0]
    if (first) {
      throw redirect({
        to: "/projects/$projectId/overview",
        params: { projectId: first.id },
      })
    }
  },
  component: Onboarding,
})

function Onboarding() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <span className="font-semibold tracking-tight">Watch</span>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Create your first project</CardTitle>
            <CardDescription>
              A project gives you a production environment and an ingestion key
              so the browser SDK can start sending telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateProjectForm
              onCreated={(project) =>
                navigate({
                  to: "/projects/$projectId/settings",
                  params: { projectId: project.id },
                })
              }
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
