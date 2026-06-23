import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import type {
  ErrorBucket,
  Issue,
  ListIssuesResult,
  ProjectDetail,
  VitalBucket,
} from "#/lib/api"
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

const ERROR_BUCKETS: ErrorBucket[] = [
  { period_start: "2026-06-22T20:00:00Z", error_count: 3, session_count: 80 },
  { period_start: "2026-06-22T21:00:00Z", error_count: 12, session_count: 95 },
  { period_start: "2026-06-22T22:00:00Z", error_count: 5, session_count: 110 },
  { period_start: "2026-06-22T23:00:00Z", error_count: 8, session_count: 88 },
]

const LCP_BUCKETS: VitalBucket[] = [
  {
    period_start: "2026-06-22T20:00:00Z",
    p75: 2100,
    mean: 1800,
    sample_count: 60,
    health_score: 75,
  },
  {
    period_start: "2026-06-22T22:00:00Z",
    p75: 1400,
    mean: 1200,
    sample_count: 88,
    health_score: 92,
  },
  {
    period_start: "2026-06-23T00:00:00Z",
    p75: 1200,
    mean: 1000,
    sample_count: 103,
    health_score: 95,
  },
]

const MOCK_ISSUE: Issue = {
  id: "cccccccc-0000-0000-0000-000000000001",
  project_id: PROJ_ID,
  environment_id: ENV_ID,
  title: "RangeError: Maximum call stack size exceeded",
  culprit: "src/lib/tree-utils.ts:24",
  status: "open",
  event_count: 30,
  user_count: 4,
  fingerprint: "fp-ccc333",
  first_seen_at: "2026-06-22T12:00:00Z",
  last_seen_at: "2026-06-23T07:00:00Z",
  created_at: "2026-06-22T12:00:00Z",
  updated_at: "2026-06-23T07:00:00Z",
}

// ── Router decorator ─────────────────────────────────────────────────────────

function withRoute(seed: (qc: QueryClient) => void): Decorator {
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
      history: createMemoryHistory({
        initialEntries: [`/projects/${PROJ_ID}/overview`],
      }),
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
  title: "Features/Overview/OverviewScreen",
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof meta>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Empty: Story = {
  decorators: [
    withRoute((qc) => {
      qc.setQueryData(["rollups", "errors", PROJ_ID, ENV_ID, "24h"], [])
      qc.setQueryData(["rollups", "vitals", PROJ_ID, ENV_ID, "LCP", "24h"], {
        metric: "LCP",
        buckets: [],
      })
      qc.setQueryData(["issues", PROJ_ID, ENV_ID, "open", 0], {
        issues: [],
        total: 0,
        limit: 5,
        offset: 0,
      } satisfies ListIssuesResult)
    }),
  ],
}

export const WithData: Story = {
  decorators: [
    withRoute((qc) => {
      qc.setQueryData(
        ["rollups", "errors", PROJ_ID, ENV_ID, "24h"],
        ERROR_BUCKETS,
      )
      qc.setQueryData(["rollups", "vitals", PROJ_ID, ENV_ID, "LCP", "24h"], {
        metric: "LCP",
        buckets: LCP_BUCKETS,
      })
      qc.setQueryData(["issues", PROJ_ID, ENV_ID, "open", 0], {
        issues: [MOCK_ISSUE],
        total: 7,
        limit: 5,
        offset: 0,
      } satisfies ListIssuesResult)
    }),
  ],
}
