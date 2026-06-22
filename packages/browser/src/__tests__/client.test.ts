import type { EventEnvelope } from "@watch/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { _resetClient, captureEvent, initClient, setUser } from "../client"

const transportState = vi.hoisted(() => ({
  endpoints: [] as string[],
  events: [] as EventEnvelope[],
}))

vi.mock("../transport", () => ({
  Transport: class MockTransport {
    constructor(endpoint: string) {
      transportState.endpoints.push(endpoint)
    }
    enqueue(event: EventEnvelope) {
      transportState.events.push(event)
    }
    async flush() {}
  },
}))

afterEach(() => {
  _resetClient()
  transportState.endpoints.length = 0
  transportState.events.length = 0
  vi.clearAllMocks()
})

describe("client DSN parsing", () => {
  it("accepts the canonical ingest endpoint DSN", () => {
    initClient({
      dsn: "https://watch.company.com/ingest/pk_abc123",
      environment: "test",
    })

    expect(transportState.endpoints).toEqual([
      "https://watch.company.com/ingest/pk_abc123",
    ])
  })

  it("accepts the legacy username DSN", () => {
    initClient({
      dsn: "https://pk_abc123@watch.company.com",
      environment: "test",
    })

    expect(transportState.endpoints).toEqual([
      "https://watch.company.com/ingest/pk_abc123",
    ])
  })

  it("rejects a DSN without an ingestion key", () => {
    expect(() =>
      initClient({
        dsn: "https://watch.company.com/ingest",
        environment: "test",
      }),
    ).toThrow(/DSN must be the ingestion endpoint URL/)
  })

  it("rejects invalid URLs", () => {
    expect(() => initClient({ dsn: "not a url", environment: "test" })).toThrow(
      /invalid DSN/,
    )
  })
})

describe("setUser", () => {
  const dsn = "https://watch.company.com/ingest/pk_abc123"

  it("attaches the pseudonymous hash to subsequent events", () => {
    initClient({ dsn, environment: "test" })
    setUser({ idHash: "hash-123" })
    captureEvent("navigation", { to: "/" })

    expect(transportState.events.at(-1)?.context.user_id_hash).toBe("hash-123")
  })

  it("omits user_id_hash when no user is set", () => {
    initClient({ dsn, environment: "test" })
    captureEvent("navigation", { to: "/" })

    expect(transportState.events.at(-1)?.context.user_id_hash).toBeUndefined()
  })

  it("clears the user when passed null", () => {
    initClient({ dsn, environment: "test" })
    setUser({ idHash: "hash-123" })
    setUser(null)
    captureEvent("navigation", { to: "/" })

    expect(transportState.events.at(-1)?.context.user_id_hash).toBeUndefined()
  })
})
