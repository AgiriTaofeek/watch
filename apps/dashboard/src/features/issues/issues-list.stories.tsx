import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import type { Issue, ListIssuesResult, ProjectDetail } from "#/lib/api"
import { routeTree } from "#/routeTree.gen"

// ── Fixtures ────────────────────────────────────────────────────────────────

const PROJ_ID = "story-proj-1"
const ENV_ID = "story-env-1"

const MOCK_USER = {
  id: "u1",
  email: "dev@example.com",
  display_name: "Dev",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
}

const MOCK_PROJECT: ProjectDetail = {
  id: PROJ_ID,
  name: "Demo App",
  slug: "demo-app",
  allowed_origins: ["http://localhost:3000"],
  environments: [
    {
      id: ENV_ID,
      name: "production",
      created_at: "2026-01-01T00:00:00Z",
      keys: [],
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
}

const OPEN_ISSUE: Issue = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  project_id: PROJ_ID,
  environment_id: ENV_ID,
  title: "TypeError: Cannot read properties of null",
  culprit: "src/features/checkout/checkout.tsx:88",
  status: "open",
  event_count: 142,
  user_count: 23,
  fingerprint: "fp-aaa111",
  first_seen_at: "2026-06-20T10:00:00Z",
  last_seen_at: "2026-06-23T08:45:00Z",
  created_at: "2026-06-20T10:00:00Z",
  updated_at: "2026-06-23T08:45:00Z",
}

const RESOLVED_ISSUE: Issue = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  project_id: PROJ_ID,
  environment_id: ENV_ID,
  title: "ReferenceError: Chart is not defined",
  culprit: "src/components/chart.tsx:12",
  status: "resolved",
  event_count: 5,
  user_count: 2,
  fingerprint: "fp-bbb222",
  first_seen_at: "2026-06-18T09:00:00Z",
  last_seen_at: "2026-06-21T14:00:00Z",
  created_at: "2026-06-18T09:00:00Z",
  updated_at: "2026-06-21T14:00:00Z",
}

// ── Router decorator ─────────────────────────────────────────────────────────

function withRoute(path: string, seed: (qc: QueryClient) => void): Decorator {
  return () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    })
    qc.setQueryData(["me"], MOCK_USER)
    qc.setQueryData(["projects"], [MOCK_PROJECT])
    seed(qc)
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient: qc },
    })
    return (
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
  }
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Features/Issues/IssuesList",
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof meta>

// ── Stories ──────────────────────────────────────────────────────────────────

const EMPTY: ListIssuesResult = { issues: [], total: 0, limit: 20, offset: 0 }

export const Empty: Story = {
  decorators: [
    withRoute(`/projects/${PROJ_ID}/issues/`, (qc) => {
      qc.setQueryData(["issues", PROJ_ID, ENV_ID, "all", 0], EMPTY)
    }),
  ],
}

export const WithIssues: Story = {
  decorators: [
    withRoute(`/projects/${PROJ_ID}/issues/`, (qc) => {
      qc.setQueryData(["issues", PROJ_ID, ENV_ID, "all", 0], {
        issues: [OPEN_ISSUE, RESOLVED_ISSUE],
        total: 2,
        limit: 20,
        offset: 0,
      } satisfies ListIssuesResult)
    }),
  ],
}

export const ManyIssues: Story = {
  decorators: [
    withRoute(`/projects/${PROJ_ID}/issues/`, (qc) => {
      qc.setQueryData(["issues", PROJ_ID, ENV_ID, "all", 0], {
        issues: [OPEN_ISSUE, RESOLVED_ISSUE],
        total: 45,
        limit: 20,
        offset: 0,
      } satisfies ListIssuesResult)
    }),
  ],
}
