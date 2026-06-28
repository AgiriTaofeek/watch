import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { SetupForm } from "#/features/auth/setup-form"

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
})

const SETUP_STEPS = [
  { label: "Account" },
  { label: "Project" },
  { label: "Install" },
  { label: "Verify" },
]

function SetupPage() {
  const navigate = useNavigate()

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-tight text-primary-foreground shadow-[0_0_0_1px_rgba(167,139,250,0.3),0_4px_16px_rgba(124,58,237,0.25)]">
          W
        </div>
        <span className="text-base font-bold tracking-tight">Watch</span>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex items-center">
        {SETUP_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center">
            {i > 0 && (
              <div className="mx-1 h-px w-8 shrink-0 bg-border" aria-hidden />
            )}
            <div
              className={`flex flex-col items-center gap-1 ${i === 0 ? "text-primary" : "text-muted-foreground/50"}`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  i === 0
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground/50"
                }`}
              >
                {i + 1}
              </span>
              <span className="text-[11px] font-medium">{step.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Setup badge */}
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
        Initial Setup
      </div>

      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">
        Create your account
      </h1>
      <p className="mb-7 text-sm text-muted-foreground">
        Set up the first owner account. This is a one-time step for your
        self-hosted instance.
      </p>

      <SetupForm
        onSuccess={() => navigate({ to: "/login" })}
        onAlreadySetUp={() => navigate({ to: "/login" })}
      />
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Already set up?{" "}
        <Link
          to="/login"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
