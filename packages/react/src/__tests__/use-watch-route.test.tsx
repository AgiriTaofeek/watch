import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@watch/browser", () => ({ setRoute: vi.fn() }))

import { setRoute } from "@watch/browser"
import { useWatchRoute } from "../use-watch-route"

afterEach(() => vi.clearAllMocks())

function Probe({ pattern }: { pattern: string }) {
  useWatchRoute(pattern)
  return null
}

describe("useWatchRoute", () => {
  it("sets the given route template", () => {
    render(<Probe pattern="/users/:id" />)
    expect(setRoute).toHaveBeenCalledWith("/users/:id")
  })

  it("updates the route only when the pattern changes", () => {
    const { rerender } = render(<Probe pattern="/a/:id" />)
    rerender(<Probe pattern="/a/:id" />) // same pattern → no extra call
    rerender(<Probe pattern="/b/:id" />) // changed → one more call
    expect(vi.mocked(setRoute).mock.calls).toEqual([["/a/:id"], ["/b/:id"]])
  })
})
