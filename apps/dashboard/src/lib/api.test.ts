import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { server } from "#/mocks/node"
import { fetchMe } from "./api"

describe("fetchMe", () => {
  test("returns null when the session is absent (401)", async () => {
    const result = await fetchMe()
    expect(result).toBeNull()
  })

  test("returns the user when the session is valid", async () => {
    server.use(
      http.get("/api/me", () =>
        HttpResponse.json({ id: "u1", email: "dev@example.com" }),
      ),
    )
    const result = await fetchMe()
    expect(result).toEqual({ id: "u1", email: "dev@example.com" })
  })

  test("throws when the server returns an unexpected error", async () => {
    server.use(
      http.get("/api/me", () => HttpResponse.json(null, { status: 500 })),
    )
    await expect(fetchMe()).rejects.toThrow("/api/me failed: 500")
  })
})
