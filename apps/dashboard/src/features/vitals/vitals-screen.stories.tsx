import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import type { ProjectDetail, VitalBucket } from "#/lib/api"
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

const LCP_BUCKETS: VitalBucket[] = [
  {
    period_start: "2026-06-22T00:00:00Z",
    p75: 2100,
    mean: 1800,
    sample_count: 120,
    health_score: 75,
  },
  {
    period_start: "2026-06-22T12:00:00Z",
    p75: 1400,
    mean: 1200,
    sample_count: 98,
    health_score: 92,
  },
  {
    period_start: "2026-06-23T00:00:00Z",
    p75: 1200,
    mean: 1000,
    sample_count: 143,
    health_score: 95,
  },
]

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
        initialEntries: [`/projects/${PROJ_ID}/vitals`],
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
  title: "Features/Vitals/VitalsScreen",
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof meta>

// ── Stories ──────────────────────────────────────────────────────────────────

const EMPTY_VITALS = { metric: "LCP" as const, buckets: [] }

export const Empty: Story = {
  decorators: [
    withRoute((qc) => {
      for (const metric of ["LCP", "CLS", "INP", "FCP", "TTFB"] as const) {
        qc.setQueryData(["rollups", "vitals", PROJ_ID, ENV_ID, metric, "7d"], {
          ...EMPTY_VITALS,
          metric,
        })
      }
    }),
  ],
}

export const WithData: Story = {
  decorators: [
    withRoute((qc) => {
      qc.setQueryData(["rollups", "vitals", PROJ_ID, ENV_ID, "LCP", "7d"], {
        metric: "LCP",
        buckets: LCP_BUCKETS,
      })
      for (const metric of ["CLS", "INP", "FCP", "TTFB"] as const) {
        qc.setQueryData(["rollups", "vitals", PROJ_ID, ENV_ID, metric, "7d"], {
          metric,
          buckets: [],
        })
      }
    }),
  ],
}
