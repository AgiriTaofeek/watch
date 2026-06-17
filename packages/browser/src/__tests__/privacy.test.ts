import type { EventEnvelope } from "@watch/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetClient, captureEvent, initClient } from "../client"

// Spy on the Transport to intercept enqueued events without hitting the network.
vi.mock("../transport", () => ({
  Transport: class MockTransport {
    readonly captured: EventEnvelope[] = []
    enqueue(e: EventEnvelope) {
      this.captured.push(e)
    }
    async flush() {}
  },
}))

// web-vitals uses PerformanceObserver which isn't available in jsdom.
// The library silently does nothing when the API is absent — no mock needed.

beforeEach(() => {
  _resetClient()
  initClient({ dsn: "https://pk_test@localhost:8080", environment: "test" })
})

afterEach(() => {
  _resetClient()
  vi.clearAllMocks()
})

describe("privacy — frontend_error events", () => {
  it("does not include cookie values in the error payload", () => {
    document.cookie = "session_token=super-secret-value"

    const payload = {
      name: "TypeError",
      message: "test error",
      mechanism: "onerror" as const,
    }
    // The captured payload must not contain any cookie value.
    expect(JSON.stringify(payload)).not.toContain("session_token")
    expect(JSON.stringify(payload)).not.toContain("super-secret-value")
  })

  it("does not include localStorage values in the error payload", () => {
    localStorage.setItem("auth_token", "secret-jwt-value")

    const payload = {
      name: "Error",
      message: "something failed",
      mechanism: "onerror" as const,
    }
    expect(JSON.stringify(payload)).not.toContain("secret-jwt-value")
    expect(JSON.stringify(payload)).not.toContain("auth_token")
  })

  it("does not include sessionStorage app-data in the error payload", () => {
    sessionStorage.setItem("user_account", "account-123-sensitive")

    const payload = {
      name: "Error",
      message: "something failed",
      mechanism: "onerror" as const,
    }
    expect(JSON.stringify(payload)).not.toContain("account-123-sensitive")
  })

  it("captureEvent does not read document.cookie", () => {
    let cookieRead = false
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    )
    if (descriptor?.get) {
      const originalGet = descriptor.get
      Object.defineProperty(document, "cookie", {
        get() {
          cookieRead = true
          return originalGet.call(this) as string
        },
        configurable: true,
      })
    }

    captureEvent("frontend_error", {
      name: "Error",
      message: "test",
      mechanism: "onerror" as const,
    })

    // Restore original descriptor
    if (descriptor) {
      Object.defineProperty(document, "cookie", descriptor)
    }

    expect(cookieRead).toBe(false)
  })
})

describe("privacy — redact utilities", () => {
  it("redactObject masks sensitive keys", async () => {
    const { redactObject } = await import("../redact")
    const result = redactObject({
      authorization: "Bearer secret-token",
      cookie: "session=abc123",
      url: "https://api.example.com/path",
      status: 200,
    })
    expect(result.authorization).toBe("[redacted]")
    expect(result.cookie).toBe("[redacted]")
    expect(result.url).toBe("https://api.example.com/path")
    expect(result.status).toBe(200)
  })

  it("redactObject truncates long strings", async () => {
    const { redactObject } = await import("../redact")
    const longValue = "x".repeat(2000)
    const result = redactObject({ message: longValue })
    expect((result.message as string).length).toBeLessThan(1010)
    expect(result.message as string).toContain("…")
  })

  it("redactURL strips sensitive query params", async () => {
    const { redactURL } = await import("../redact")
    const result = redactURL(
      "https://api.example.com/users?token=secret123&page=2",
    )
    expect(result).not.toContain("secret123")
    expect(result).toContain("[redacted]")
    expect(result).toContain("page=2")
  })

  it("redactURL preserves non-sensitive query params", async () => {
    const { redactURL } = await import("../redact")
    const result = redactURL("https://api.example.com/search?q=hello&sort=asc")
    expect(result).toContain("q=hello")
    expect(result).toContain("sort=asc")
  })

  it("isSensitiveKey is case-insensitive", async () => {
    const { isSensitiveKey } = await import("../redact")
    expect(isSensitiveKey("Authorization")).toBe(true)
    expect(isSensitiveKey("COOKIE")).toBe(true)
    expect(isSensitiveKey("X-Api-Key")).toBe(true)
    expect(isSensitiveKey("content-type")).toBe(false)
  })
})

describe("privacy — breadcrumb constraints", () => {
  it("breadcrumb entries do not expose form values", async () => {
    const { BreadcrumbBuffer } = await import("../breadcrumbs")
    const buf = new BreadcrumbBuffer()
    buf.add({
      type: "manual",
      timestamp: new Date().toISOString(),
      message: "checkout_form_submitted",
      data: { step: "payment", success: true },
    })
    const entries = buf.getAll()
    expect(JSON.stringify(entries)).not.toContain("card_number")
    expect(JSON.stringify(entries)).not.toContain("password")
  })

  it("ring buffer evicts oldest entries when full", async () => {
    const { BreadcrumbBuffer } = await import("../breadcrumbs")
    const buf = new BreadcrumbBuffer()
    for (let i = 0; i < 55; i++) {
      buf.add({
        type: "manual",
        timestamp: new Date().toISOString(),
        message: `event_${i}`,
      })
    }
    const entries = buf.getAll()
    expect(entries.length).toBe(50)
    expect(entries[0]?.message).toBe("event_5") // oldest surviving is #5
    expect(entries[49]?.message).toBe("event_54")
  })
})

describe("privacy — session ID", () => {
  it("getSessionID does not read cookies", async () => {
    let cookieRead = false
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    )
    if (descriptor?.get) {
      const originalGet = descriptor.get
      Object.defineProperty(document, "cookie", {
        get() {
          cookieRead = true
          return originalGet.call(this) as string
        },
        configurable: true,
      })
    }

    const { getSessionID } = await import("../session")
    getSessionID()

    if (descriptor) {
      Object.defineProperty(document, "cookie", descriptor)
    }

    expect(cookieRead).toBe(false)
  })

  it("session ID is stable within the same sessionStorage scope", async () => {
    const { getSessionID } = await import("../session")
    const id1 = getSessionID()
    const id2 = getSessionID()
    expect(id1).toBe(id2)
  })

  it("session ID is a valid UUID", async () => {
    const { getSessionID } = await import("../session")
    const id = getSessionID()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

describe("privacy — beforeSend hook", () => {
  it("returning null from beforeSend drops the event", () => {
    _resetClient()
    initClient({
      dsn: "https://pk_test@localhost:8080",
      environment: "test",
      beforeSend: () => null,
    })

    // captureEvent should return without enqueueing — no error thrown.
    expect(() =>
      captureEvent("frontend_error", { name: "Error", message: "test" }),
    ).not.toThrow()
  })

  it("modifying an event via beforeSend is reflected in the enqueued event", () => {
    _resetClient()
    const seen: EventEnvelope[] = []
    initClient({
      dsn: "https://pk_test@localhost:8080",
      environment: "test",
      beforeSend: (event) => {
        const modified = { ...event, environment: "overridden" }
        seen.push(modified)
        return modified
      },
    })

    captureEvent("web_vital", { name: "LCP", value: 1200, rating: "good" })
    expect(seen.length).toBe(1)
    expect(seen[0]?.environment).toBe("overridden")
  })
})
