import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import {
  createEnvironment,
  type EnvironmentDetail,
  type IngestionKey,
  mintKey,
  revokeKey,
} from "#/lib/api"
import { projectsQueryOptions } from "#/lib/api/queries"
import { dsnFor } from "#/lib/ingest"

// Invalidate the shared projects cache after any mutation so the shell switchers
// and this screen reflect the change.
function useInvalidateProjects() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: projectsQueryOptions().queryKey })
}

export function ProjectSettings({ projectId }: { projectId: string }) {
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)

  if (!project) return null

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{project.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allowed origins</CardTitle>
          <CardDescription>
            Browser events are only accepted from these origins.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {project.allowed_origins.length > 0 ? (
            project.allowed_origins.map((o) => (
              <Badge key={o} variant="secondary">
                {o}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None set</span>
          )}
        </CardContent>
      </Card>

      {project.environments.map((env) => (
        <EnvironmentCard key={env.id} env={env} />
      ))}

      <CreateEnvironmentCard projectId={projectId} />
    </div>
  )
}

function EnvironmentCard({ env }: { env: EnvironmentDetail }) {
  const invalidate = useInvalidateProjects()
  const mint = useMutation({
    mutationFn: () => mintKey({ data: { environmentId: env.id } }),
    onSuccess: invalidate,
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{env.name}</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mint.mutate()}
          disabled={mint.isPending}
        >
          {mint.isPending ? "Minting…" : "Mint key"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {env.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No keys yet — mint one to get a DSN.
          </p>
        ) : (
          env.keys.map((key) => <KeyRow key={key.id} apiKey={key} />)
        )}
      </CardContent>
    </Card>
  )
}

function KeyRow({ apiKey }: { apiKey: IngestionKey }) {
  const invalidate = useInvalidateProjects()
  const [copied, setCopied] = useState(false)
  const dsn = dsnFor(apiKey.public_key)
  const revoked = apiKey.revoked_at != null

  const revoke = useMutation({
    mutationFn: () => revokeKey({ data: { keyId: apiKey.id } }),
    onSuccess: invalidate,
  })

  async function copy() {
    await navigator.clipboard.writeText(dsn)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <code
        className={`flex-1 truncate text-xs ${revoked ? "text-muted-foreground line-through" : ""}`}
        title={dsn}
      >
        {dsn}
      </code>
      {revoked ? (
        <Badge variant="secondary">revoked</Badge>
      ) : (
        <>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copy DSN"
            onClick={copy}
          >
            {copied ? (
              <Check className="size-4 text-success" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending}
          >
            Revoke
          </Button>
        </>
      )}
    </div>
  )
}

function CreateEnvironmentCard({ projectId }: { projectId: string }) {
  const invalidate = useInvalidateProjects()
  const [name, setName] = useState("")
  const create = useMutation({
    mutationFn: (envName: string) =>
      createEnvironment({ data: { projectId, name: envName } }),
    onSuccess: () => {
      invalidate()
      setName("")
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New environment</CardTitle>
        <CardDescription>
          e.g. staging, preview. Each gets its own ingestion keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate(name.trim())
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="staging"
            aria-label="Environment name"
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
