import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import type { User } from "#/lib/api"

// Auth boundary for all dashboard routes. context.user is resolved by the root
// beforeLoad via the meQueryOptions server fn; absent session → /login. The app
// chrome (sidebar/header) lives in the project-scoped shell, not here, so this
// layout is a bare passthrough.
export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" })
    return { user: context.user } satisfies { user: User }
  },
  component: () => <Outlet />,
})
