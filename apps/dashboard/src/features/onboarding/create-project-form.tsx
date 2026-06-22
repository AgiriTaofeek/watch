import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { ApiError, createProject, type ProjectDetail } from "#/lib/api"
import { projectsQueryOptions } from "#/lib/api/queries"

type Props = {
  onCreated: (project: ProjectDetail) => void
}

// Parse a textarea of origins (one per line or comma-separated) into a clean list.
function parseOrigins(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((o) => o.trim())
    .filter(Boolean)
}

export function CreateProjectForm({ onCreated }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [origins, setOrigins] = useState("")

  const mutation = useMutation({
    mutationFn: (data: { name: string; allowed_origins: string[] }) =>
      createProject({ data }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      })
      onCreated(project)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      name: name.trim(),
      allowed_origins: parseOrigins(origins),
    })
  }

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "Something went wrong. Please try again."
        : null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Checkout web"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-origins">Allowed origins</Label>
        <Textarea
          id="project-origins"
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          placeholder={"https://app.example.com\nhttp://localhost:5173"}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          One per line. Browser events are only accepted from these origins.
        </p>
      </div>
      <Button type="submit" disabled={mutation.isPending || !name.trim()}>
        {mutation.isPending ? "Creating…" : "Create project"}
      </Button>
    </form>
  )
}
