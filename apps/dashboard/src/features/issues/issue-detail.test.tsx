import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { getIssue, type Issue, updateIssueStatus } from "#/lib/api"
import { renderWithQuery } from "#/test/render"
import { IssueDetail } from "./issue-detail"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
    [k: string]: unknown
  }) => (
    <a href="/mock" className={className}>
      {children}
    </a>
  ),
}))

vi.mock("#/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/api")>()
  return { ...actual, getIssue: vi.fn(), updateIssueStatus: vi.fn() }
})

const mockGetIssue = vi.mocked(getIssue)
const mockUpdateIssueStatus = vi.mocked(updateIssueStatus)

const CULPRIT = "src/utils/format.ts:18"

const OPEN_ISSUE: Issue = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  project_id: "p1",
  environment_id: "e1",
  title: "TypeError: Cannot read properties of undefined",
  culprit: CULPRIT,
  status: "open",
  event_count: 57,
  user_count: 8,
  fingerprint: "fp-aaa111",
  first_seen_at: "2026-06-20T10:00:00Z",
  last_seen_at: "2026-06-23T08:00:00Z",
  created_at: "2026-06-20T10:00:00Z",
  updated_at: "2026-06-23T08:00:00Z",
}

const RESOLVED_ISSUE: Issue = {
  ...OPEN_ISSUE,
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  status: "resolved",
}

beforeEach(() => {
  mockGetIssue.mockReset()
  mockUpdateIssueStatus.mockReset()
})

describe("IssueDetail", () => {
  test("renders skeleton while loading", async () => {
    let resolve: (v: Issue) => void = () => {}
    mockGetIssue.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    expect(
      document.querySelector(".animate-pulse, [class*='skeleton']"),
    ).toBeTruthy()
    resolve(OPEN_ISSUE)
    await screen.findByRole("heading", { name: OPEN_ISSUE.title })
  })

  test("renders title, culprit, and stats for a loaded issue", async () => {
    mockGetIssue.mockResolvedValue(OPEN_ISSUE)
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    await screen.findByRole("heading", { name: OPEN_ISSUE.title })
    // culprit appears in header and exception card — at least one instance
    expect(screen.getAllByText(CULPRIT).length).toBeGreaterThan(0)
    expect(screen.getByText(/total events/i)).toBeInTheDocument()
  })

  test("shows Resolve and Ignore buttons for an open issue", async () => {
    mockGetIssue.mockResolvedValue(OPEN_ISSUE)
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    await screen.findByRole("button", { name: /^resolve$/i })
    expect(
      screen.getByRole("button", { name: /^ignore$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^reopen$/i }),
    ).not.toBeInTheDocument()
  })

  test("shows only Reopen for a resolved issue", async () => {
    mockGetIssue.mockResolvedValue(RESOLVED_ISSUE)
    renderWithQuery(<IssueDetail projectId="p1" issueId={RESOLVED_ISSUE.id} />)
    await screen.findByRole("button", { name: /^reopen$/i })
    expect(
      screen.queryByRole("button", { name: /^resolve$/i }),
    ).not.toBeInTheDocument()
  })

  test("clicking Resolve calls updateIssueStatus with 'resolved'", async () => {
    const user = userEvent.setup()
    mockGetIssue.mockResolvedValue(OPEN_ISSUE)
    mockUpdateIssueStatus.mockResolvedValue(undefined)
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    await user.click(await screen.findByRole("button", { name: /^resolve$/i }))
    await waitFor(() =>
      expect(mockUpdateIssueStatus).toHaveBeenCalledWith({
        data: { issueId: OPEN_ISSUE.id, status: "resolved" },
      }),
    )
  })

  test("shows error alert when mutation fails", async () => {
    const user = userEvent.setup()
    mockGetIssue.mockResolvedValue(OPEN_ISSUE)
    mockUpdateIssueStatus.mockRejectedValue(new Error("Server error"))
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    await user.click(await screen.findByRole("button", { name: /^resolve$/i }))
    await screen.findByRole("alert")
  })

  test("back link renders with Issues text", async () => {
    mockGetIssue.mockResolvedValue(OPEN_ISSUE)
    renderWithQuery(<IssueDetail projectId="p1" issueId={OPEN_ISSUE.id} />)
    await screen.findByRole("heading", { name: OPEN_ISSUE.title })
    expect(screen.getByRole("link", { name: /issues/i })).toBeInTheDocument()
  })
})
