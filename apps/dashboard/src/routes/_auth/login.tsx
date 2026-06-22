import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { LoginForm } from "#/features/auth/login-form"
import type { User } from "#/lib/api"
import { meQueryOptions } from "#/lib/api/queries"

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  function handleSuccess(user: User) {
    queryClient.setQueryData(meQueryOptions().queryKey, user)
    navigate({ to: "/" })
  }

  return (
    <div className="w-full max-w-sm">
      <BrandMark />
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">
        Sign in to Watch
      </h1>
      <p className="mb-7 text-sm text-muted-foreground">
        Self-hosted production health monitoring for your frontend.
      </p>
      <LoginForm onSuccess={handleSuccess} />
      <p className="mt-5 text-center text-xs text-muted-foreground">
        No account yet?{" "}
        <Link
          to="/setup"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Run the setup wizard
        </Link>
      </p>
    </div>
  )
}

function BrandMark() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-tight text-primary-foreground shadow-[0_0_0_1px_rgba(167,139,250,0.3),0_4px_16px_rgba(124,58,237,0.25)]">
        W
      </div>
      <span className="text-base font-bold tracking-tight">Watch</span>
    </div>
  )
}
