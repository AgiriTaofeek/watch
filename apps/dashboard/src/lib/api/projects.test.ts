import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { server } from "#/mocks/node"
import { createProject, listProjects, mintKey, revokeKey } from "./projects"

const MOCK_PROJECT = {
  id: "p1",
  name: "My App",
  slug: "my-app",
  allowed_origins: ["https://example.com"],
  created_at: "2024-01-01T00:00:00Z",
  environments: [
    {
      id: "e1",
      name: "production",
      created_at: "2024-01-01T00:00:00Z",
      keys: [
        {
          id: "k1",
          public_key: "pk_abc123",
          created_at: "2024-01-01T00:00:00Z",
          revoked_at: null,
        },
      ],
    },
  ],
}

describe("listProjects", () => {
  test("returns empty array when no projects exist", async () => {
    expect(await listProjects()).toEqual([])
  })

  test("returns project list on success", async () => {
    server.use(
      http.get("/api/projects", () =>
        HttpResponse.json({ projects: [MOCK_PROJECT] }),
      ),
    )
    expect(await listProjects()).toEqual([MOCK_PROJECT])
  })
})

describe("createProject", () => {
  test("throws ApiError(400) when name is missing", async () => {
    await expect(
      createProject({ name: "", allowed_origins: [] }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test("returns created project on success", async () => {
    server.use(
      http.post("/api/projects", () =>
        HttpResponse.json(MOCK_PROJECT, { status: 201 }),
      ),
    )
    const result = await createProject({
      name: "My App",
      allowed_origins: ["https://example.com"],
    })
    expect(result.name).toBe("My App")
    expect(result.environments).toHaveLength(1)
  })
})

describe("mintKey", () => {
  test("throws ApiError(404) when environment does not exist", async () => {
    await expect(mintKey("env-missing")).rejects.toMatchObject({ status: 404 })
  })

  test("returns a key with public_key on success", async () => {
    const key = {
      id: "k2",
      public_key: "pk_new123",
      created_at: "2024-01-01T00:00:00Z",
      revoked_at: null,
    }
    server.use(
      http.post("/api/environments/:id/keys", () =>
        HttpResponse.json(key, { status: 201 }),
      ),
    )
    expect(await mintKey("e1")).toEqual(key)
  })
})

describe("revokeKey", () => {
  test("throws ApiError(404) when key does not exist", async () => {
    await expect(revokeKey("k-missing")).rejects.toMatchObject({ status: 404 })
  })

  test("resolves on success (204)", async () => {
    server.use(
      http.delete(
        "/api/keys/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    await expect(revokeKey("k1")).resolves.toBeUndefined()
  })
})
