import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Sign in to Watch</CardTitle>
        <CardDescription>
          Enter your credentials to access the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <LoginForm onSuccess={handleSuccess} />
        <p className="text-center text-xs text-muted-foreground">
          <Link
            to="/setup"
            className="underline underline-offset-4 hover:text-foreground"
          >
            First time? Set up Watch
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
