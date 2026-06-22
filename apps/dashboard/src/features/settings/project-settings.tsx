import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Key, Settings, User } from "lucide-react"
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
import { LogoutButton } from "#/features/auth/logout-button"
import {
  createEnvironment,
  type EnvironmentDetail,
  type IngestionKey,
  mintKey,
  revokeKey,
} from "#/lib/api"
import { projectsQueryOptions } from "#/lib/api/queries"
import { dsnFor } from "#/lib/ingest"

type Panel = "general" | "keys" | "account"

const NAV_ITEMS: { id: Panel; label: string; icon: typeof Key }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "keys", label: "Environments & Keys", icon: Key },
  { id: "account", label: "Account", icon: User },
]

function useInvalidateProjects() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: projectsQueryOptions().queryKey })
}

export function ProjectSettings({ projectId }: { projectId: string }) {
  const [panel, setPanel] = useState<Panel>("keys")
  const { data: projects = [] } = useQuery(projectsQueryOptions())
  const project = projects.find((p) => p.id === projectId)

  if (!project) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{project.name}</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar nav */}
        <nav className="w-44 shrink-0 overflow-hidden rounded-lg border bg-card">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPanel(id)}
              className={`flex w-full items-center gap-2 border-b px-3.5 py-2.5 text-left text-sm font-medium transition-colors last:border-b-0 ${
                panel === id
                  ? "bg-primary/8 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" />
              {label}
            </button>
          ))}
        </nav>

        {/* Panel content */}
        <div className="min-w-0 flex-1">
          {panel === "general" && <GeneralPanel project={project} />}
          {panel === "keys" && (
            <KeysPanel projectId={projectId} project={project} />
          )}
          {panel === "account" && <AccountPanel />}
        </div>
      </div>
    </div>
  )
}

function GeneralPanel({
  project,
}: {
  project: { name: string; slug: string; allowed_origins: string[] }
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">Project Settings</p>
          <p className="text-xs text-muted-foreground">
            General configuration for this project
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project name</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{project.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contact your instance admin to rename this project.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Allowed origins</CardTitle>
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
    </div>
  )
}

function KeysPanel({
  projectId,
  project,
}: {
  projectId: string
  project: { environments: EnvironmentDetail[] }
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">Environments &amp; Keys</p>
          <p className="text-xs text-muted-foreground">
            Ingestion keys authenticate SDK events from your environments
          </p>
        </div>
      </div>

      {project.environments.map((env) => (
        <EnvironmentCard key={env.id} env={env} />
      ))}

      <CreateEnvironmentCard projectId={projectId} />
    </div>
  )
}

function AccountPanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold">Account</p>
        <p className="text-xs text-muted-foreground">
          Manage your session and account settings
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">
              You will be redirected to the login page
            </p>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
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
