import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import ThemeToggle from "#/components/theme-toggle"
import { LogoutButton } from "#/features/auth/logout-button"
import type { User } from "#/lib/api"

// Protected layout — wraps all dashboard routes.
// context.user is resolved by the root beforeLoad via the meQueryOptions server fn.
// If the session is absent, redirect to login.
export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" })
    return { user: context.user } satisfies { user: User }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const { user } = Route.useRouteContext()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b bg-background/80 px-6 py-3 backdrop-blur">
        <span className="font-semibold tracking-tight">Watch</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
