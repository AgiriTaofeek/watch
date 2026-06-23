import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ErrorBucket,
  getErrorRollups,
  getVitalRollups,
  type Issue,
  listIssues,
} from "#/lib/api"
import { renderWithQuery } from "#/test/render"
import { OverviewScreen } from "./overview-screen"

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
  return {
    ...actual,
    getErrorRollups: vi.fn(),
    getVitalRollups: vi.fn(),
    listIssues: vi.fn(),
  }
})

const mockGetErrorRollups = vi.mocked(getErrorRollups)
const mockGetVitalRollups = vi.mocked(getVitalRollups)
const mockListIssues = vi.mocked(listIssues)

const MOCK_ERROR_BUCKET: ErrorBucket = {
  period_start: "2026-06-23T00:00:00Z",
  error_count: 5,
  session_count: 100,
}

const MOCK_ISSUE: Issue = {
  id: "cccccccc-0000-0000-0000-000000000001",
  project_id: "p1",
  environment_id: "e1",
  title: "RangeError: Maximum call stack size exceeded",
  culprit: "src/lib/recursion.ts:5",
  status: "open",
  event_count: 30,
  user_count: 4,
  fingerprint: "fp-ccc333",
  first_seen_at: "2026-06-22T12:00:00Z",
  last_seen_at: "2026-06-23T07:00:00Z",
  created_at: "2026-06-22T12:00:00Z",
  updated_at: "2026-06-23T07:00:00Z",
}

function setupEmptyMocks() {
  mockGetErrorRollups.mockResolvedValue([])
  mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
  mockListIssues.mockResolvedValue({
    issues: [],
    total: 0,
    limit: 5,
    offset: 0,
  })
}

beforeEach(() => {
  mockGetErrorRollups.mockReset()
  mockGetVitalRollups.mockReset()
  mockListIssues.mockReset()
})

describe("OverviewScreen", () => {
  test("renders all 4 metric card labels", async () => {
    setupEmptyMocks()
    renderWithQuery(<OverviewScreen projectId="p1" environmentId="e1" />)
    for (const label of [
      "Error Events",
      "Open Issues",
      "LCP p75",
      "Affected Sessions",
    ]) {
      await screen.findByText(label)
    }
  })

  test("shows open issue total from listIssues", async () => {
    mockGetErrorRollups.mockResolvedValue([])
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    mockListIssues.mockResolvedValue({
      issues: [],
      total: 7,
      limit: 5,
      offset: 0,
    })
    renderWithQuery(<OverviewScreen projectId="p1" environmentId="e1" />)
    // The Open Issues metric card should show "7"
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument())
  })

  test("shows recent issues rows when data is present", async () => {
    mockGetErrorRollups.mockResolvedValue([MOCK_ERROR_BUCKET])
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    mockListIssues.mockResolvedValue({
      issues: [MOCK_ISSUE],
      total: 1,
      limit: 5,
      offset: 0,
    })
    renderWithQuery(<OverviewScreen projectId="p1" environmentId="e1" />)
    await screen.findByText(MOCK_ISSUE.title)
  })

  test("renders without crashing when all data is empty", async () => {
    setupEmptyMocks()
    renderWithQuery(<OverviewScreen projectId="p1" environmentId="e1" />)
    // No uncaught error — heading renders
    await screen.findByRole("heading", { name: /overview/i })
  })

  test("does not fetch when environmentId is empty string", () => {
    setupEmptyMocks()
    renderWithQuery(<OverviewScreen projectId="p1" environmentId="" />)
    // Queries are disabled (enabled: !!environmentId), so API functions not called
    expect(mockGetErrorRollups).not.toHaveBeenCalled()
    expect(mockListIssues).not.toHaveBeenCalled()
  })
})
