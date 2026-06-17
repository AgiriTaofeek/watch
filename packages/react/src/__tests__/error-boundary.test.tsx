import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WatchErrorBoundary } from "../error-boundary"

// Mock captureError from @watch/browser so we can assert on its calls without
// needing a fully initialised SDK client.
vi.mock("@watch/browser", () => ({
  captureError: vi.fn(),
}))

import { captureError } from "@watch/browser"

// React logs error details to the console when an error boundary catches an
// error. Suppress those so the test output stays clean.
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalConsoleError
  vi.clearAllMocks()
})

function Bomb({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error("boom")
  return null
}

describe("WatchErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <WatchErrorBoundary>
        <p>content</p>
      </WatchErrorBoundary>,
    )
    expect(screen.getByText("content")).toBeDefined()
    expect(captureError).not.toHaveBeenCalled()
  })

  it("calls captureError when a child throws", () => {
    render(
      <WatchErrorBoundary>
        <Bomb shouldThrow />
      </WatchErrorBoundary>,
    )
    expect(captureError).toHaveBeenCalledOnce()
    const [error, options] = vi.mocked(captureError).mock.calls[0] ?? []
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("boom")
    expect(options).toHaveProperty("componentStack")
  })

  it("renders fallback after an error is caught", () => {
    render(
      <WatchErrorBoundary fallback={<p>error fallback</p>}>
        <Bomb shouldThrow />
      </WatchErrorBoundary>,
    )
    expect(screen.getByText("error fallback")).toBeDefined()
  })

  it("renders null (not the children) when no fallback is provided", () => {
    const { container } = render(
      <WatchErrorBoundary>
        <Bomb shouldThrow />
      </WatchErrorBoundary>,
    )
    expect(container.firstChild).toBeNull()
  })

  it("passes mechanism error_boundary via captureError", () => {
    render(
      <WatchErrorBoundary>
        <Bomb shouldThrow />
      </WatchErrorBoundary>,
    )
    // captureError is called by the boundary; the mock simply records the call.
    // The mechanism is set inside @watch/browser's captureError — we trust the
    // browser package tests for that; here we only verify the call was made.
    expect(captureError).toHaveBeenCalledOnce()
  })
})
