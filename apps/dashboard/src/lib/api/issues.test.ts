import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { server } from "#/mocks/node"
import { getIssue, listIssues, updateIssueStatus } from "./issues"

const MOCK_ISSUE = {
  id: "i1",
  project_id: "p1",
  environment_id: "e1",
  fingerprint: "TypeError:Cannot read properties of undefined",
  title: "TypeError: Cannot read properties of undefined",
  culprit: "/dashboard",
  status: "open" as const,
  first_seen_at: "2024-01-01T00:00:00Z",
  last_seen_at: "2024-01-02T00:00:00Z",
  event_count: 42,
  user_count: 5,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
}

describe("listIssues", () => {
  test("returns empty list when no issues exist", async () => {
    const result = await listIssues("p1", { environmentId: "e1" })
    expect(result.issues).toEqual([])
    expect(result.total).toBe(0)
  })

  test("returns paginated issue list on success", async () => {
    server.use(
      http.get("/api/projects/:id/issues", () =>
        HttpResponse.json({
          issues: [MOCK_ISSUE],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    )
    const result = await listIssues("p1", { environmentId: "e1" })
    expect(result.issues).toEqual([MOCK_ISSUE])
    expect(result.total).toBe(1)
  })

  test("filters by status when provided", async () => {
    let capturedUrl = ""
    server.use(
      http.get("/api/projects/:id/issues", ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ issues: [], total: 0, limit: 50, offset: 0 })
      }),
    )
    await listIssues("p1", { environmentId: "e1", status: "resolved" })
    expect(capturedUrl).toContain("status=resolved")
  })
})

describe("getIssue", () => {
  test("throws ApiError(404) when issue does not exist", async () => {
    await expect(getIssue("i-missing")).rejects.toMatchObject({ status: 404 })
  })

  test("returns issue detail on success", async () => {
    server.use(http.get("/api/issues/:id", () => HttpResponse.json(MOCK_ISSUE)))
    expect(await getIssue("i1")).toEqual(MOCK_ISSUE)
  })
})

describe("updateIssueStatus", () => {
  test("resolves on success (204)", async () => {
    await expect(updateIssueStatus("i1", "resolved")).resolves.toBeUndefined()
  })

  test("throws ApiError(404) when issue does not exist", async () => {
    server.use(
      http.patch("/api/issues/:id/status", () =>
        HttpResponse.json({ error: "issue not found" }, { status: 404 }),
      ),
    )
    await expect(
      updateIssueStatus("i-missing", "resolved"),
    ).rejects.toMatchObject({
      status: 404,
    })
  })
})
