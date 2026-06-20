import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { server } from "#/mocks/node"
import { fetchMe, login, logout, setup } from "./auth"
import { ApiError } from "./client"

const MOCK_USER = {
  id: "u1",
  email: "dev@example.com",
  display_name: null,
  role: "owner",
  created_at: "2024-01-01T00:00:00Z",
}

describe("fetchMe", () => {
  test("returns null when the session is absent (401)", async () => {
    expect(await fetchMe()).toBeNull()
  })

  test("returns the user when the session is valid", async () => {
    server.use(http.get("/me", () => HttpResponse.json(MOCK_USER)))
    expect(await fetchMe()).toEqual(MOCK_USER)
  })

  test("throws for unexpected server errors", async () => {
    server.use(http.get("/me", () => HttpResponse.json(null, { status: 500 })))
    await expect(fetchMe()).rejects.toThrow(ApiError)
  })
})

describe("setup", () => {
  test("throws ApiError(409) when setup is already complete", async () => {
    await expect(
      setup({ email: "a@b.com", password: "pass" }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  test("returns the created user on first call", async () => {
    server.use(
      http.post("/auth/setup", () =>
        HttpResponse.json(MOCK_USER, { status: 201 }),
      ),
    )
    expect(await setup({ email: "a@b.com", password: "pass" })).toEqual(
      MOCK_USER,
    )
  })
})

describe("login", () => {
  test("throws ApiError(401) for wrong credentials", async () => {
    await expect(
      login({ email: "a@b.com", password: "wrong" }),
    ).rejects.toMatchObject({
      status: 401,
    })
  })

  test("returns user and stores csrf token on success", async () => {
    server.use(
      http.post("/auth/login", () =>
        HttpResponse.json({ user: MOCK_USER, csrf_token: "tok_abc" }),
      ),
    )
    expect(await login({ email: "a@b.com", password: "correct" })).toEqual(
      MOCK_USER,
    )
  })
})

describe("logout", () => {
  test("resolves on success (204)", async () => {
    await expect(logout()).resolves.toBeUndefined()
  })
})
