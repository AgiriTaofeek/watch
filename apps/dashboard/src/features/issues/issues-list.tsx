import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Check, MoreVertical, Search, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { Input } from "#/components/ui/input"
import { IssueStatusBadge } from "#/components/ui/issue-status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { type IssueStatus, listIssues, updateIssueStatus } from "#/lib/api"

const PAGE = 20
const STATUS_FILTERS = ["all", "open", "resolved", "ignored"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function IssuesList({
  projectId,
  environmentId,
}: {
  projectId: string
  environmentId: string
}) {
  const [status, setStatus] = useState<StatusFilter>("all")
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState("")
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["issues", projectId, environmentId, status, offset],
    queryFn: () =>
      listIssues({
        data: {
          projectId,
          environmentId,
          status: status === "all" ? undefined : (status as IssueStatus),
          limit: PAGE,
          offset,
        },
      }),
    enabled: !!environmentId,
    placeholderData: keepPreviousData,
  })

  const resolveMutation = useMutation({
    mutationFn: (issueId: string) =>
      updateIssueStatus({ data: { issueId, status: "resolved" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] })
    },
  })

  function onFilter(next: StatusFilter) {
    setStatus(next)
    setOffset(0)
  }

  const result = query.data
  const total = result?.total ?? 0

  const filterLower = filter.toLowerCase()
  const visibleIssues = result?.issues.filter((issue) => {
    if (!filterLower) return true
    return (
      issue.title.toLowerCase().includes(filterLower) ||
      (issue.culprit?.toLowerCase().includes(filterLower) ?? false)
    )
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-52">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Filter issues…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setOffset(0)
            }}
            aria-label="Filter issues by title or culprit"
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => onFilter(v as StatusFilter)}
        >
          <SelectTrigger
            className="h-8 w-36 text-sm"
            aria-label="Filter by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue="24h">
          <SelectTrigger className="h-8 w-28 text-sm" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 text-sm">
            Resolve all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Column settings"
          >
            <SlidersHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>Couldn't load issues.</p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : visibleIssues && visibleIssues.length === 0 ? (
        <EmptyState
          title="No issues"
          description={
            filter
              ? "No issues match your filter."
              : status === "all"
                ? "No grouped errors in this environment yet."
                : `No ${status} issues.`
          }
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">
                    Issue
                  </TableHead>
                  <TableHead className="w-28 text-xs font-medium uppercase tracking-wide">
                    Status
                  </TableHead>
                  <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                    Events
                  </TableHead>
                  <TableHead className="w-20 text-right text-xs font-medium uppercase tracking-wide">
                    Users
                  </TableHead>
                  <TableHead className="w-36 text-xs font-medium uppercase tracking-wide">
                    Last seen
                  </TableHead>
                  <TableHead className="w-11" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleIssues?.map((issue) => {
                  const isDimmed =
                    issue.status === "resolved" || issue.status === "ignored"
                  return (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <Link
                          to="/projects/$projectId/issues/$issueId"
                          params={{ projectId, issueId: issue.id }}
                          className={`text-sm font-medium hover:underline ${isDimmed ? "text-muted-foreground" : ""}`}
                        >
                          {issue.title}
                        </Link>
                        {issue.culprit && (
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {issue.culprit}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <IssueStatusBadge status={issue.status} />
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${isDimmed ? "text-muted-foreground" : ""}`}
                      >
                        {issue.event_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {issue.user_count > 0
                          ? issue.user_count.toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatWhen(issue.last_seen_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        {issue.status === "open" ? (
                          <button
                            type="button"
                            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            title="Resolve"
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate(issue.id)}
                            aria-label="Resolve issue"
                          >
                            <Check className="size-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="More options"
                            aria-label="More options"
                          >
                            <MoreVertical className="size-3" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total === 0
                ? "0 issues"
                : `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}`}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
