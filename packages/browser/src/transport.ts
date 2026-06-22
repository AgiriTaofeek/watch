import type { EventEnvelope } from "@watch/contracts"

const FLUSH_INTERVAL_MS = 5_000
const MAX_QUEUE_SIZE = 100
const MAX_RETRIES = 3

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Transport queues events and flushes them to the Watch ingest endpoint.
// Each event is sent as a single POST (the server expects one event per
// request). Flushes happen on a timer and on page hide (visibilitychange).
export class Transport {
  private queue: EventEnvelope[] = []
  private readonly endpoint: string
  // Snapshot of the global fetch taken at construction time so that the
  // network instrumentation wrapper (which patches window.fetch later) does
  // not intercept the SDK's own ingest calls and create feedback loops.
  // Bound to globalThis: a bare `fetch` reference called as `this._fetch(...)`
  // throws "Illegal invocation" in real browsers (fetch requires this === window).
  private readonly _fetch: typeof fetch = fetch.bind(globalThis)

  constructor(endpoint: string) {
    this.endpoint = endpoint
    this.scheduleFlush()

    // Best-effort flush when the user navigates away or closes the tab.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          void this.flush()
        }
      })
    }
  }

  enqueue(event: EventEnvelope): void {
    // When the queue is full, drop the oldest event to make room.
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift()
    }
    this.queue.push(event)
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0)
    await Promise.all(batch.map((e) => this.sendWithRetry(e)))
  }

  private scheduleFlush(): void {
    setTimeout(async () => {
      await this.flush()
      this.scheduleFlush()
    }, FLUSH_INTERVAL_MS)
  }

  private async sendWithRetry(
    event: EventEnvelope,
    attempt = 0,
  ): Promise<void> {
    try {
      const response = await this._fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        keepalive: true, // allows the request to outlive the page
      })
      // 4xx errors are not retried — they indicate a client-side problem
      // (wrong key, bad schema) that retrying won't fix.
      if (response.status >= 400 && response.status < 500) return
      // 5xx or unexpected status: retry with exponential backoff.
      if (!response.ok && attempt < MAX_RETRIES) {
        await delay(2 ** attempt * 1_000)
        return this.sendWithRetry(event, attempt + 1)
      }
    } catch {
      // Network failure: retry.
      if (attempt < MAX_RETRIES) {
        await delay(2 ** attempt * 1_000)
        return this.sendWithRetry(event, attempt + 1)
      }
    }
  }
}
