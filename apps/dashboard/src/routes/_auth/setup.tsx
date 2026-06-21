import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { SetupForm } from "#/features/auth/setup-form"

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
})

function SetupPage() {
  const navigate = useNavigate()

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Set up Watch</CardTitle>
        <CardDescription>
          Create the first owner account. This account will have full access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SetupForm
          onSuccess={() => navigate({ to: "/login" })}
          onAlreadySetUp={() => navigate({ to: "/login" })}
        />
        <p className="text-center text-xs text-muted-foreground">
          <Link
            to="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Already set up? Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
