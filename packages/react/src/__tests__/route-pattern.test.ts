import { describe, expect, test } from "vitest"
import { buildRoutePattern } from "../route-pattern"

describe("buildRoutePattern", () => {
  test("templates a single dynamic segment", () => {
    expect(buildRoutePattern("/users/123", { id: "123" })).toBe("/users/:id")
  })

  test("leaves a static path unchanged", () => {
    expect(buildRoutePattern("/dashboard/settings", {})).toBe(
      "/dashboard/settings",
    )
  })

  test("templates multiple params across nested segments", () => {
    expect(
      buildRoutePattern("/org/acme/users/42", { orgId: "acme", id: "42" }),
    ).toBe("/org/:orgId/users/:id")
  })

  test("only replaces whole segments, not substrings", () => {
    // The id '42' must not corrupt the static 'v42' segment.
    expect(buildRoutePattern("/v42/items/42", { id: "42" })).toBe(
      "/v42/items/:id",
    )
  })

  test("repeated values map to distinct param keys", () => {
    const out = buildRoutePattern("/a/5/b/5", { x: "5", y: "5" })
    // Both dynamic segments are templated (exact key order is not significant).
    expect(out).toMatch(/^\/a\/:(x|y)\/b\/:(x|y)$/)
    expect(out).not.toContain("/5")
  })

  test("collapses a trailing splat to *", () => {
    expect(buildRoutePattern("/files/a/b/c", { "*": "a/b/c" })).toBe("/files/*")
  })

  test("handles a splat alongside a named param", () => {
    expect(buildRoutePattern("/u/7/files/x/y", { id: "7", "*": "x/y" })).toBe(
      "/u/:id/files/*",
    )
  })

  test("handles an empty splat match", () => {
    expect(buildRoutePattern("/files", { "*": "" })).toBe("/files/*")
  })

  test("root path stays '/'", () => {
    expect(buildRoutePattern("/", {})).toBe("/")
  })
})
