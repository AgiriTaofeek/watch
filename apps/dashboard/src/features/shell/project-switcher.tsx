import { useNavigate } from "@tanstack/react-router"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type { ProjectDetail } from "#/lib/api"

// Switching project navigates to that project's overview. Selection lives in the
// URL ($projectId), so back/forward and link-sharing work — see
// docs/milestone-6/frontend-architecture.md §11.
export function ProjectSwitcher({
  projects,
  projectId,
}: {
  projects: ProjectDetail[]
  projectId: string
}) {
  const navigate = useNavigate()

  return (
    <Select
      value={projectId}
      onValueChange={(id) =>
        navigate({
          to: "/projects/$projectId/overview",
          params: { projectId: id },
        })
      }
    >
      <SelectTrigger className="w-[180px]" aria-label="Project">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
