import { afterEach, describe, expect, it, vi } from "vitest"
import { _resetClient, initClient } from "../client"

const transportState = vi.hoisted(() => ({
  endpoints: [] as string[],
}))

vi.mock("../transport", () => ({
  Transport: class MockTransport {
    constructor(endpoint: string) {
      transportState.endpoints.push(endpoint)
    }
    enqueue() {}
    async flush() {}
  },
}))

afterEach(() => {
  _resetClient()
  transportState.endpoints.length = 0
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
