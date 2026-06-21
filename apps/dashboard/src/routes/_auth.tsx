import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

// Public layout — wraps /login and /setup.
// context.user is resolved by root beforeLoad via fetchCurrentUser (server fn).
// If a session already exists, bounce to the dashboard immediately.
export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/" })
  },
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Outlet />
    </div>
  )
}
