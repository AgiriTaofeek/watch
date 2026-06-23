import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type Issue,
  type ListIssuesResult,
  listIssues,
  updateIssueStatus,
} from "#/lib/api"
import { renderWithQuery } from "#/test/render"
import { IssuesList } from "./issues-list"

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
  return { ...actual, listIssues: vi.fn(), updateIssueStatus: vi.fn() }
})

const mockListIssues = vi.mocked(listIssues)
const mockUpdateIssueStatus = vi.mocked(updateIssueStatus)

const MOCK_ISSUE: Issue = {
  id: "12345678-0000-0000-0000-000000000001",
  project_id: "p1",
  environment_id: "e1",
  title: "TypeError: Cannot read properties of null",
  culprit: "src/pages/home.tsx:42",
  status: "open",
  event_count: 100,
  user_count: 12,
  fingerprint: "fp-abc123",
  first_seen_at: "2026-06-20T10:00:00Z",
  last_seen_at: "2026-06-23T08:00:00Z",
  created_at: "2026-06-20T10:00:00Z",
  updated_at: "2026-06-23T08:00:00Z",
}

const RESOLVED_ISSUE: Issue = {
  ...MOCK_ISSUE,
  id: "22222222-0000-0000-0000-000000000002",
  title: "ReferenceError: x is not defined",
  status: "resolved",
}

const EMPTY_RESULT: ListIssuesResult = {
  issues: [],
  total: 0,
  limit: 20,
  offset: 0,
}

beforeEach(() => {
  mockListIssues.mockReset()
  mockUpdateIssueStatus.mockReset()
})

describe("IssuesList", () => {
  test("renders skeleton while loading", async () => {
    let resolve: (v: ListIssuesResult) => void = () => {}
    mockListIssues.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    expect(
      document.querySelector(".animate-pulse, [class*='skeleton']"),
    ).toBeTruthy()
    resolve({ issues: [MOCK_ISSUE], total: 1, limit: 20, offset: 0 })
    await screen.findByText(MOCK_ISSUE.title)
  })

  test("renders issue rows when data loads", async () => {
    mockListIssues.mockResolvedValue({
      issues: [MOCK_ISSUE, RESOLVED_ISSUE],
      total: 2,
      limit: 20,
      offset: 0,
    })
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(MOCK_ISSUE.title)
    expect(screen.getByText(RESOLVED_ISSUE.title)).toBeInTheDocument()
  })

  test("shows empty state when list is empty", async () => {
    mockListIssues.mockResolvedValue(EMPTY_RESULT)
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(/no issues/i)
  })

  test("shows error state with retry button on failure", async () => {
    mockListIssues.mockRejectedValue(new Error("network error"))
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(/couldn't load issues/i)
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  test("client-side filter narrows visible rows", async () => {
    const user = userEvent.setup()
    mockListIssues.mockResolvedValue({
      issues: [MOCK_ISSUE, RESOLVED_ISSUE],
      total: 2,
      limit: 20,
      offset: 0,
    })
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(MOCK_ISSUE.title)

    await user.type(screen.getByPlaceholderText(/filter issues/i), "TypeError")

    expect(screen.getByText(MOCK_ISSUE.title)).toBeInTheDocument()
    expect(screen.queryByText(RESOLVED_ISSUE.title)).not.toBeInTheDocument()
  })

  test("typing in filter resets to page 1", async () => {
    const user = userEvent.setup()
    mockListIssues.mockResolvedValue({
      issues: [MOCK_ISSUE],
      total: 40,
      limit: 20,
      offset: 0,
    })
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(MOCK_ISSUE.title)

    // Go to page 2
    await user.click(screen.getByRole("button", { name: /^next$/i }))
    const prevBtn = screen.getByRole("button", { name: /^previous$/i })
    await waitFor(() => expect(prevBtn).not.toBeDisabled())

    // Type to filter (matching title keeps rows visible)
    await user.type(screen.getByPlaceholderText(/filter issues/i), "TypeError")

    // Offset reset → Previous disabled
    await waitFor(() => expect(prevBtn).toBeDisabled())
  })

  test("quick-resolve calls updateIssueStatus with resolved", async () => {
    const user = userEvent.setup()
    mockListIssues.mockResolvedValue({
      issues: [MOCK_ISSUE],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mockUpdateIssueStatus.mockResolvedValue(undefined)
    renderWithQuery(<IssuesList projectId="p1" environmentId="e1" />)
    await screen.findByText(MOCK_ISSUE.title)

    await user.click(screen.getByRole("button", { name: /resolve issue/i }))

    await waitFor(() =>
      expect(mockUpdateIssueStatus).toHaveBeenCalledWith({
        data: { issueId: MOCK_ISSUE.id, status: "resolved" },
      }),
    )
  })
})
