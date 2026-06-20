import { HttpResponse, http } from "msw"

// Default handlers reflect the unauthenticated state of the app.
// Override per-test or per-story with server.use() / msw parameters.
export const handlers = [
  http.get("/api/me", () => HttpResponse.json(null, { status: 401 })),
  http.get("/api/projects", () => HttpResponse.json([])),
]
