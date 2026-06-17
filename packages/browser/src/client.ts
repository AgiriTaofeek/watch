import type { EventEnvelope, EventType } from "@watch/contracts"
import { installAssetInstrumentation } from "./assets"
import type { BreadcrumbEntry } from "./breadcrumbs"
import { BreadcrumbBuffer } from "./breadcrumbs"
import { installErrorHandlers } from "./errors"
import type { FrontendErrorPayload } from "./errors"
import { installNavigationInstrumentation } from "./navigation"
import { installNetworkInstrumentation } from "./network"
import { getSessionID } from "./session"
import { Transport } from "./transport"
import { collectVitals } from "./vitals"

export interface InitOptions {
  dsn: string
  environment?: string
  release?: string
  beforeSend?: (event: EventEnvelope) => EventEnvelope | null | undefined
}

interface ParsedDSN {
  key: string
  endpoint: string // https://<host>/ingest/<key>
}

interface WatchClient {
  options: {
    dsn: string
    environment: string
    release: string | undefined
    beforeSend: InitOptions["beforeSend"]
  }
  dsn: ParsedDSN
  sessionID: string
  breadcrumbs: BreadcrumbBuffer
  transport: Transport
  cleanup: Array<() => void>
}

let _client: WatchClient | null = null

function parseDSN(dsn: string): ParsedDSN {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    throw new Error(
      `Watch: invalid DSN "${dsn}". Expected format: https://<key>@<host>`,
    )
  }
  const key = url.username
  if (!key) {
    throw new Error(
      "Watch: DSN must include the ingestion key as the URL username (e.g. https://pk_abc123@your-server.com)",
    )
  }
  const base = `${url.protocol}//${url.host}`
  return { key, endpoint: `${base}/ingest/${key}` }
}

function currentRoute(): string {
  return typeof window !== "undefined" ? window.location.pathname : ""
}

function nowISO(): string {
  return new Date().toISOString()
}

export function initClient(options: InitOptions): void {
  if (_client) {
    console.warn("Watch: init() called more than once — ignoring.")
    return
  }

  const parsedDSN = parseDSN(options.dsn)
  const sessionID = getSessionID()
  const breadcrumbs = new BreadcrumbBuffer()
  const transport = new Transport(parsedDSN.endpoint)

  // Use a local variable so TypeScript knows the reference is stable while
  // we push the cleanup function (module-level _client could theoretically
  // be reassigned during installErrorHandlers).
  const client: WatchClient = {
    options: {
      dsn: options.dsn,
      environment: options.environment ?? "production",
      release: options.release,
      beforeSend: options.beforeSend,
    },
    dsn: parsedDSN,
    sessionID,
    breadcrumbs,
    transport,
    cleanup: [],
  }
  _client = client

  // Error capture — attach breadcrumb snapshot at the time of each error.
  const stopErrors = installErrorHandlers((payload: FrontendErrorPayload) => {
    captureEvent("frontend_error", {
      ...payload,
      breadcrumbs: breadcrumbs.getAll(),
    })
  })
  client.cleanup.push(stopErrors)

  // Web Vitals
  collectVitals((payload) => captureEvent("web_vital", payload))

  // Navigation timing (page load) + SPA route changes
  client.cleanup.push(
    installNavigationInstrumentation(
      (payload) => captureEvent("navigation", payload),
      (entry) => addBreadcrumbToClient(entry),
    ),
  )

  // Network failure capture (fetch + XHR). Must be installed AFTER Transport is
  // constructed so Transport._fetch holds the un-patched original.
  client.cleanup.push(
    installNetworkInstrumentation(
      (payload) => captureEvent("network_request", payload),
      (entry) => addBreadcrumbToClient(entry),
    ),
  )

  // Asset load failures (<script>, <link>, <img> that 404 or error).
  client.cleanup.push(
    installAssetInstrumentation(
      (payload) => captureEvent("asset_load", payload),
      (entry) => addBreadcrumbToClient(entry),
    ),
  )
}

export function captureEvent(type: EventType, payload: unknown): void {
  const client = _client
  if (!client) return

  let event: EventEnvelope = {
    environment: client.options.environment,
    release: client.options.release,
    service: "frontend",
    timestamp: nowISO(),
    type,
    context: {
      route: currentRoute(),
      session_id: client.sessionID,
    },
    payload,
  }

  if (client.options.beforeSend) {
    const result = client.options.beforeSend(event)
    if (result == null) return // user dropped the event
    event = result
  }

  client.transport.enqueue(event)
}

export function addBreadcrumbToClient(
  entry: Omit<BreadcrumbEntry, "timestamp">,
): void {
  _client?.breadcrumbs.add({ ...entry, timestamp: nowISO() })
}

// Exposed for testing — allows resetting singleton state between test cases.
export function _resetClient(): void {
  if (_client) {
    for (const fn of _client.cleanup) fn()
  }
  _client = null
}
