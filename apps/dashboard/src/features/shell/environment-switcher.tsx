import { useNavigate } from "@tanstack/react-router"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type { EnvironmentDetail } from "#/lib/api"

// The selected environment lives in the `environment_id` search param. Switching
// updates only the search param so it stays on the current screen.
export function EnvironmentSwitcher({
  environments,
  environmentId,
}: {
  environments: EnvironmentDetail[]
  environmentId: string
}) {
  const navigate = useNavigate()

  return (
    <Select
      value={environmentId}
      onValueChange={(id) =>
        navigate({
          to: ".",
          search: (prev) => ({ ...prev, environment_id: id }),
        })
      }
    >
      <SelectTrigger className="w-[150px]" aria-label="Environment">
        <SelectValue placeholder="Environment" />
      </SelectTrigger>
      <SelectContent>
        {environments.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
