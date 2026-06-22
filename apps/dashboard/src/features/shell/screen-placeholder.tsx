import { EmptyState } from "#/components/ui/empty-state"

// Temporary screen body used while a screen's real content is built in a later
// task/milestone. Keeps the shell navigable without shipping fake data.
export function ScreenPlaceholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <EmptyState title="Coming soon" description={description} />
    </div>
  )
}
