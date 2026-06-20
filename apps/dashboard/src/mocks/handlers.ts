import { HttpResponse, http } from "msw"

// Default handlers reflect the unauthenticated state of the app.
// Override per-test or per-story with server.use() / msw parameters.
export const handlers = [
  // Auth
  http.get("/me", () => HttpResponse.json(null, { status: 401 })),
  http.post("/auth/setup", () =>
    HttpResponse.json({ error: "setup already completed" }, { status: 409 }),
  ),
  http.post("/auth/login", () =>
    HttpResponse.json({ error: "invalid email or password" }, { status: 401 }),
  ),
  http.post("/auth/logout", () => new HttpResponse(null, { status: 204 })),

  // Projects
  http.get("/api/projects", () => HttpResponse.json({ projects: [] })),
  http.post("/api/projects", () =>
    HttpResponse.json({ error: "name is required" }, { status: 400 }),
  ),
  http.post("/api/projects/:id/environments", () =>
    HttpResponse.json({ error: "project not found" }, { status: 404 }),
  ),
  http.post("/api/environments/:id/keys", () =>
    HttpResponse.json({ error: "environment not found" }, { status: 404 }),
  ),
  http.delete("/api/keys/:id", () =>
    HttpResponse.json({ error: "active key not found" }, { status: 404 }),
  ),

  // Issues
  http.get("/api/projects/:id/issues", () =>
    HttpResponse.json({ issues: [], total: 0, limit: 50, offset: 0 }),
  ),
  http.get("/api/issues/:id", () =>
    HttpResponse.json({ error: "issue not found" }, { status: 404 }),
  ),
  http.patch(
    "/api/issues/:id/status",
    () => new HttpResponse(null, { status: 204 }),
  ),

  // Rollups
  http.get("/api/projects/:id/rollups/errors", () =>
    HttpResponse.json({ buckets: [] }),
  ),
  http.get("/api/projects/:id/rollups/vitals", () =>
    HttpResponse.json({ metric: "LCP", buckets: [] }),
  ),
]
