import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { server } from "#/mocks/node"
import { ApiError } from "../error"

// The BFF transport reads request context and writes response headers through
// @tanstack/react-start/server. In the test environment there is no live
// request, so we stub those helpers and drive them per-test.
const ctx = {
  cookie: "" as string,
  csrf: undefined as string | undefined,
  setHeaders: [] as Array<[string, string | string[]]>,
}

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) =>
    name === "cookie" ? ctx.cookie : undefined,
  getCookie: (name: string) => (name === "watch_csrf" ? ctx.csrf : undefined),
  setResponseHeader: (name: string, value: string | string[]) =>
    ctx.setHeaders.push([name, value]),
}))

// Imported after the mock so the module binds to the stubbed helpers.
const { serverRequest } = await import("./request")

const API = "http://localhost:8080"

beforeEach(() => {
  ctx.cookie = ""
  ctx.csrf = undefined
  ctx.setHeaders = []
})
afterEach(() => server.resetHandlers())

describe("serverRequest", () => {
  test("forwards the browser cookie to the Go API", async () => {
    ctx.cookie = "watch_session=sess-1; watch_csrf=tok-1"
    let received: string | null = null
    server.use(
      http.get(`${API}/me`, ({ request }) => {
        received = request.headers.get("cookie")
        return HttpResponse.json({ id: "u1" })
      }),
    )

    await serverRequest("GET", "/me")

    expect(received).toBe("watch_session=sess-1; watch_csrf=tok-1")
  })

  test("attaches X-CSRF-Token from watch_csrf on mutating methods", async () => {
    ctx.csrf = "tok-1"
    let received: string | null = "absent"
    server.use(
      http.post(`${API}/api/projects`, ({ request }) => {
        received = request.headers.get("X-CSRF-Token")
        return HttpResponse.json({ id: "p1" })
      }),
    )

    await serverRequest("POST", "/api/projects", { name: "App" })

    expect(received).toBe("tok-1")
  })

  test("omits X-CSRF-Token on safe methods", async () => {
    ctx.csrf = "tok-1"
    let received: string | null = "absent"
    server.use(
      http.get(`${API}/api/projects`, ({ request }) => {
        received = request.headers.get("X-CSRF-Token")
        return HttpResponse.json({ projects: [] })
      }),
    )

    await serverRequest("GET", "/api/projects")

    expect(received).toBeNull()
  })

  test("relays Go's Set-Cookie headers back to the browser response", async () => {
    server.use(
      http.post(`${API}/auth/login`, () => {
        const headers = new Headers()
        headers.append("Set-Cookie", "watch_session=sess-1; HttpOnly; Path=/")
        headers.append("Set-Cookie", "watch_csrf=tok-1; HttpOnly; Path=/")
        return HttpResponse.json({ user: { id: "u1" } }, { headers })
      }),
    )

    await serverRequest("POST", "/auth/login", {
      email: "a@b.com",
      password: "x",
    })

    const relayed = ctx.setHeaders.find(([name]) => name === "set-cookie")
    expect(relayed?.[1]).toEqual([
      "watch_session=sess-1; HttpOnly; Path=/",
      "watch_csrf=tok-1; HttpOnly; Path=/",
    ])
  })

  test("returns undefined for 204 No Content", async () => {
    server.use(
      http.delete(
        `${API}/api/keys/k1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    expect(await serverRequest("DELETE", "/api/keys/k1")).toBeUndefined()
  })

  test("throws ApiError with the server's error message on non-2xx", async () => {
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json(
          { error: "authentication required" },
          { status: 401 },
        ),
      ),
    )

    await expect(serverRequest("GET", "/me")).rejects.toMatchObject({
      status: 401,
      message: "authentication required",
    })
    await expect(serverRequest("GET", "/me")).rejects.toBeInstanceOf(ApiError)
  })

  test("falls back to a generic message when the error body has no error field", async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(null, { status: 500 })),
    )
    await expect(serverRequest("GET", "/me")).rejects.toMatchObject({
      status: 500,
      message: "request failed",
    })
  })
})
