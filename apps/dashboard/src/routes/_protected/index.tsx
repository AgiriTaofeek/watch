import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/")({
  component: DashboardHome,
})

// Placeholder for the overview screen built in Task 11.
function DashboardHome() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Project overview and metrics will appear here.
      </p>
    </main>
  )
}
