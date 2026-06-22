import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@watch/browser", () => ({ setRoute: vi.fn() }))
vi.mock("react-router-dom", () => ({ useRouteMatch: vi.fn() }))

import { setRoute } from "@watch/browser"
import { useRouteMatch } from "react-router-dom"
import { WatchRouteContextV5 } from "../router-v5"

afterEach(() => vi.clearAllMocks())

describe("WatchRouteContextV5", () => {
  it("sets the route from the v5 match template (match.path)", () => {
    vi.mocked(useRouteMatch).mockReturnValue({
      path: "/users/:id",
      url: "/users/123",
      params: { id: "123" },
      isExact: true,
    })

    render(<WatchRouteContextV5 />)

    expect(setRoute).toHaveBeenCalledWith("/users/:id")
  })

  it("falls back to '/' when there is no match", () => {
    vi.mocked(useRouteMatch).mockReturnValue(null)

    render(<WatchRouteContextV5 />)

    expect(setRoute).toHaveBeenCalledWith("/")
  })

  it("renders nothing", () => {
    vi.mocked(useRouteMatch).mockReturnValue({
      path: "/",
      url: "/",
      params: {},
      isExact: true,
    })

    const { container } = render(<WatchRouteContextV5 />)

    expect(container.firstChild).toBeNull()
  })
})
