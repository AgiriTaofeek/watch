import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { IssueStatusBadge } from "#/components/ui/issue-status-badge"
import { Skeleton } from "#/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { getIssue, type IssueStatus, updateIssueStatus } from "#/lib/api"

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function IssueDetail({
  projectId,
  issueId,
}: {
  projectId: string
  issueId: string
}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => getIssue({ data: { issueId } }),
  })

  const mutation = useMutation({
    mutationFn: (status: IssueStatus) =>
      updateIssueStatus({ data: { issueId, status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] })
      queryClient.invalidateQueries({ queryKey: ["issues"] })
    },
  })

  return (
    <div className="space-y-6">
      <Link
        to="/projects/$projectId/issues"
        params={{ projectId }}
        search={(prev) => prev}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Issues
      </Link>

      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>Couldn't load this issue.</p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        query.data && (
          <>
            {/* Issue header */}
            <div className="space-y-3 border-b pb-5">
              {/* Metadata row */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IssueStatusBadge status={query.data.status} />
                  <span>·</span>
                  <code className="font-mono text-xs">
                    {query.data.id.slice(0, 8).toUpperCase()}
                  </code>
                  <span>·</span>
                  <span>
                    first seen {formatAbsolute(query.data.first_seen_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {query.data.status !== "resolved" && (
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate("resolved")}
                    >
                      Resolve
                    </Button>
                  )}
                  {query.data.status !== "ignored" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate("ignored")}
                    >
                      Ignore
                    </Button>
                  )}
                  {(query.data.status === "resolved" ||
                    query.data.status === "ignored") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate("open")}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {/* Title + culprit */}
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {query.data.title}
                </h1>
                {query.data.culprit && (
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {query.data.culprit}
                  </p>
                )}
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap divide-x rounded-md border bg-muted/40">
                <StatItem
                  label="Total events"
                  value={query.data.event_count.toLocaleString()}
                />
                <StatItem
                  label="Sessions"
                  value={query.data.user_count.toLocaleString()}
                />
                <StatItem
                  label="First seen"
                  value={formatAbsolute(query.data.first_seen_at)}
                />
                <StatItem
                  label="Last seen"
                  value={formatRelative(query.data.last_seen_at)}
                />
              </div>

              {mutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  Couldn't update status. Please try again.
                </p>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview">
              <TabsList variant="line">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="breadcrumbs">Breadcrumbs</TabsTrigger>
                <TabsTrigger value="occurrences">Occurrences</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {/* Main: exception card */}
                  <div className="min-w-0 flex-1">
                    <div className="overflow-hidden rounded-lg border bg-card">
                      <div className="border-b px-3.5 py-2.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Exception
                        </span>
                      </div>
                      <div className="p-3.5">
                        <p className="font-mono text-sm font-semibold text-destructive">
                          {query.data.title}
                        </p>
                        {query.data.culprit && (
                          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                            {query.data.culprit}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sidebar: metadata */}
                  <div className="w-full sm:w-64 shrink-0">
                    <div className="overflow-hidden rounded-lg border bg-card">
                      <div className="border-b px-3.5 py-2.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Metadata
                        </span>
                      </div>
                      <div className="divide-y text-sm">
                        <MetaRow
                          label="fingerprint"
                          value={query.data.fingerprint}
                          mono
                        />
                        <MetaRow label="issue id" value={query.data.id} mono />
                        <MetaRow
                          label="created"
                          value={formatAbsolute(query.data.created_at)}
                        />
                        <MetaRow
                          label="updated"
                          value={formatAbsolute(query.data.updated_at)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="breadcrumbs" className="mt-4">
                <EmptyState
                  title="No breadcrumbs"
                  description="Breadcrumb capture is not yet available."
                />
              </TabsContent>

              <TabsContent value="occurrences" className="mt-4">
                <EmptyState
                  title="No occurrence data"
                  description="Per-issue occurrence history is not yet available."
                />
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-lg font-bold tabular-nums leading-tight">
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span
        className={`break-all text-xs ${mono ? "font-mono text-foreground/80" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  )
}
