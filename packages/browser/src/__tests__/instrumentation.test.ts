import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type AssetLoadPayload, installAssetInstrumentation } from "../assets"
import type { BreadcrumbEntry } from "../breadcrumbs"
import {
  type NavigationPayload,
  installNavigationInstrumentation,
} from "../navigation"
import {
  type NetworkRequestPayload,
  installNetworkInstrumentation,
} from "../network"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectNavigation() {
  const events: NavigationPayload[] = []
  const breadcrumbs: Omit<BreadcrumbEntry, "timestamp">[] = []
  const restore = installNavigationInstrumentation(
    (p) => events.push(p),
    (b) => breadcrumbs.push(b),
  )
  return { events, breadcrumbs, restore }
}

function collectNetwork() {
  const failures: NetworkRequestPayload[] = []
  const breadcrumbs: Omit<BreadcrumbEntry, "timestamp">[] = []
  const restore = installNetworkInstrumentation(
    (p) => failures.push(p),
    (b) => breadcrumbs.push(b),
  )
  return { failures, breadcrumbs, restore }
}

function collectAssets() {
  const failures: AssetLoadPayload[] = []
  const breadcrumbs: Omit<BreadcrumbEntry, "timestamp">[] = []
  const restore = installAssetInstrumentation(
    (p) => failures.push(p),
    (b) => breadcrumbs.push(b),
  )
  return { failures, breadcrumbs, restore }
}

// ---------------------------------------------------------------------------
// Navigation instrumentation
// ---------------------------------------------------------------------------

describe("navigation instrumentation", () => {
  afterEach(() => {
    // Reset jsdom location back to the default.
    history.pushState(null, "", "/")
  })

  it("emits a push navigation event and breadcrumb on history.pushState", () => {
    const { events, breadcrumbs, restore } = collectNavigation()

    history.pushState(null, "", "/dashboard")

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      to: "/dashboard",
      navigation_type: "push",
    })
    expect(breadcrumbs).toHaveLength(1)
    expect(breadcrumbs[0]?.type).toBe("navigation")
    expect(breadcrumbs[0]?.message).toContain("/dashboard")

    restore()
  })

  it("emits a replace navigation event on history.replaceState", () => {
    const { events, restore } = collectNavigation()

    history.replaceState(null, "", "/settings")

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      to: "/settings",
      navigation_type: "replace",
    })

    restore()
  })

  it("emits a popstate event on browser back navigation", () => {
    const { events, restore } = collectNavigation()

    // Simulate the browser firing popstate after navigating back.
    history.pushState(null, "", "/a")
    history.pushState(null, "", "/b")

    // Clear the push events so we only see the popstate.
    events.length = 0

    window.dispatchEvent(new PopStateEvent("popstate"))

    expect(events).toHaveLength(1)
    expect(events[0]?.navigation_type).toBe("popstate")

    restore()
  })

  it("restores original history methods after cleanup", () => {
    const originalPush = history.pushState
    const { restore } = collectNavigation()

    expect(history.pushState).not.toBe(originalPush)
    restore()
    expect(history.pushState).toBe(originalPush)
  })

  it("tracks the from-path correctly across multiple pushes", () => {
    const { events, restore } = collectNavigation()

    history.pushState(null, "", "/a")
    history.pushState(null, "", "/b")
    history.pushState(null, "", "/c")

    expect(events[1]).toMatchObject({ from: "/a", to: "/b" })
    expect(events[2]).toMatchObject({ from: "/b", to: "/c" })

    restore()
  })
})

// ---------------------------------------------------------------------------
// Network instrumentation — fetch
// ---------------------------------------------------------------------------

describe("network instrumentation — fetch", () => {
  beforeEach(() => {
    // Replace global fetch with a controllable mock BEFORE installing the
    // instrumentation so the wrapper captures our mock as the "original".
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not emit a failure event for a successful fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))
    const { failures, breadcrumbs, restore } = collectNetwork()

    await fetch("/api/ok")

    expect(failures).toHaveLength(0)
    expect(breadcrumbs).toHaveLength(1)
    expect(breadcrumbs[0]?.data?.status).toBe(200)

    restore()
  })

  it("emits a failure event for a 4xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))
    const { failures, breadcrumbs, restore } = collectNetwork()

    await fetch("/api/missing")

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      method: "GET",
      status: 404,
      failure_reason: "non_ok_status",
    })
    expect(failures[0]?.url).toContain("/api/missing")
    expect(breadcrumbs).toHaveLength(1)

    restore()
  })

  it("emits a network_error failure when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"))
    const { failures, restore } = collectNetwork()

    await expect(fetch("/api/down")).rejects.toThrow("Failed to fetch")

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      method: "GET",
      failure_reason: "network_error",
    })
    expect(failures[0]?.status).toBeUndefined()

    restore()
  })

  it("uppercases the HTTP method", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }))
    const { failures, restore } = collectNetwork()

    await fetch("/api/x", { method: "post" })

    expect(failures[0]?.method).toBe("POST")

    restore()
  })

  it("redacts sensitive query parameters from the URL", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))
    const { failures, restore } = collectNetwork()

    await fetch("/api/data?token=secret123&page=2")

    expect(failures[0]?.url).toContain("[redacted]")
    expect(failures[0]?.url).not.toContain("secret123")
    expect(failures[0]?.url).toContain("page=2")

    restore()
  })

  it("restores the original fetch after cleanup", () => {
    const originalFetch = fetch
    const { restore } = collectNetwork()

    expect(fetch).not.toBe(originalFetch)
    restore()
    expect(fetch).toBe(originalFetch)
  })
})

// ---------------------------------------------------------------------------
// Network instrumentation — XHR
// ---------------------------------------------------------------------------

describe("network instrumentation — XHR", () => {
  it("patches XMLHttpRequest prototype methods", () => {
    const originalOpen = XMLHttpRequest.prototype.open
    const { restore } = collectNetwork()

    expect(XMLHttpRequest.prototype.open).not.toBe(originalOpen)

    restore()
    expect(XMLHttpRequest.prototype.open).toBe(originalOpen)
  })
})

// ---------------------------------------------------------------------------
// Asset instrumentation
// ---------------------------------------------------------------------------

describe("asset instrumentation", () => {
  it("captures a script load failure", () => {
    const { failures, breadcrumbs, restore } = collectAssets()

    const script = document.createElement("script")
    script.src = "https://cdn.example.com/chunk.js"
    document.body.appendChild(script)

    // Manually fire the capture-phase error event as jsdom does not load
    // external scripts; we simulate what the browser would fire.
    const errorEvent = new Event("error", { bubbles: false })
    Object.defineProperty(errorEvent, "target", { value: script })
    window.dispatchEvent(errorEvent)

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      asset_type: "script",
    })
    expect(failures[0]?.url).toContain("chunk.js")
    expect(breadcrumbs).toHaveLength(1)
    expect(breadcrumbs[0]?.type).toBe("asset")

    document.body.removeChild(script)
    restore()
  })

  it("captures a stylesheet load failure", () => {
    const { failures, restore } = collectAssets()

    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://cdn.example.com/styles.css"
    document.head.appendChild(link)

    const errorEvent = new Event("error", { bubbles: false })
    Object.defineProperty(errorEvent, "target", { value: link })
    window.dispatchEvent(errorEvent)

    expect(failures[0]).toMatchObject({ asset_type: "stylesheet" })

    document.head.removeChild(link)
    restore()
  })

  it("ignores non-element error events (JS runtime errors)", () => {
    const { failures, restore } = collectAssets()

    // A JS error event has target = window, not an HTMLElement.
    const errorEvent = new ErrorEvent("error", {
      message: "Script error",
      bubbles: true,
    })
    window.dispatchEvent(errorEvent)

    expect(failures).toHaveLength(0)

    restore()
  })

  it("restores the error listener after cleanup", () => {
    const { restore } = collectAssets()
    restore()

    const { failures: failures2, restore: restore2 } = collectAssets()

    // If the first listener were still active it would have been called.
    // Only the second collector's listener should be active now.
    const script = document.createElement("script")
    script.src = "https://cdn.example.com/x.js"
    const errorEvent = new Event("error", { bubbles: false })
    Object.defineProperty(errorEvent, "target", { value: script })
    window.dispatchEvent(errorEvent)

    expect(failures2).toHaveLength(1)

    restore2()
  })
})
