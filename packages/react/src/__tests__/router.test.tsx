import { render } from "@testing-library/react"
import type { UIMatch } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WatchRouterContext } from "../router"

vi.mock("@watch/browser", () => ({
  setRoute: vi.fn(),
}))

vi.mock("react-router", () => ({
  useMatches: vi.fn(),
}))

import { setRoute } from "@watch/browser"
import { useMatches } from "react-router"

afterEach(() => {
  vi.clearAllMocks()
})

function setup(matches: Partial<UIMatch>[]): void {
  vi.mocked(useMatches).mockReturnValue(matches as UIMatch[])
}

describe("WatchRouterContext", () => {
  it("calls setRoute with the pathname of the deepest match when there are no params", () => {
    setup([
      {
        id: "root",
        pathname: "/",
        params: {},
        data: undefined,
        handle: undefined,
      },
      {
        id: "dashboard",
        pathname: "/dashboard",
        params: {},
        data: undefined,
        handle: undefined,
      },
    ])

    render(<WatchRouterContext />)

    expect(setRoute).toHaveBeenCalledWith("/dashboard")
  })

  it("reconstructs a route template by replacing param values with :paramName", () => {
    setup([
      {
        id: "root",
        pathname: "/",
        params: {},
        data: undefined,
        handle: undefined,
      },
      {
        id: "users.$id",
        pathname: "/users/123",
        params: { id: "123" },
        data: undefined,
        handle: undefined,
      },
    ])

    render(<WatchRouterContext />)

    expect(setRoute).toHaveBeenCalledWith("/users/:id")
  })

  it("handles multiple params in the route", () => {
    setup([
      {
        id: "orgs.$org.repos.$repo",
        pathname: "/orgs/acme/repos/watch",
        params: { org: "acme", repo: "watch" },
        data: undefined,
        handle: undefined,
      },
    ])

    render(<WatchRouterContext />)

    // Both param values are replaced.
    const route = vi.mocked(setRoute).mock.calls[0]?.[0] ?? ""
    expect(route).toContain(":org")
    expect(route).toContain(":repo")
    expect(route).not.toContain("acme")
    expect(route).not.toContain("watch")
  })

  it("does not call setRoute when matches array is empty", () => {
    setup([])

    render(<WatchRouterContext />)

    expect(setRoute).not.toHaveBeenCalled()
  })

  it("renders nothing (null)", () => {
    setup([
      {
        id: "root",
        pathname: "/",
        params: {},
        data: undefined,
        handle: undefined,
      },
    ])

    const { container } = render(<WatchRouterContext />)

    expect(container.firstChild).toBeNull()
  })
})
