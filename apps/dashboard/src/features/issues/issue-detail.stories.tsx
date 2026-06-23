import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import type { Issue, ProjectDetail } from "#/lib/api"
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
  id: "story-issue-1",
  project_id: PROJ_ID,
  environment_id: ENV_ID,
  title: "TypeError: Cannot read properties of undefined (reading 'map')",
  culprit: "src/features/dashboard/overview.tsx:134",
  status: "open",
  event_count: 57,
  user_count: 8,
  fingerprint: "fp-aaa111bbb222",
  first_seen_at: "2026-06-20T10:00:00Z",
  last_seen_at: "2026-06-23T08:00:00Z",
  created_at: "2026-06-20T10:00:00Z",
  updated_at: "2026-06-23T08:00:00Z",
}

const RESOLVED_ISSUE: Issue = {
  ...OPEN_ISSUE,
  id: "story-issue-2",
  status: "resolved",
}
const IGNORED_ISSUE: Issue = {
  ...OPEN_ISSUE,
  id: "story-issue-3",
  status: "ignored",
}

// ── Router decorator ─────────────────────────────────────────────────────────

function withRoute(issue: Issue): Decorator {
  return () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    })
    qc.setQueryData(["me"], MOCK_USER)
    qc.setQueryData(["projects"], [MOCK_PROJECT])
    qc.setQueryData(["issue", issue.id], issue)
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/projects/${PROJ_ID}/issues/${issue.id}`],
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
  title: "Features/Issues/IssueDetail",
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof meta>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Open: Story = { decorators: [withRoute(OPEN_ISSUE)] }
export const Resolved: Story = { decorators: [withRoute(RESOLVED_ISSUE)] }
export const Ignored: Story = { decorators: [withRoute(IGNORED_ISSUE)] }
