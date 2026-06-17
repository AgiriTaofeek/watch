import type { BreadcrumbEntry } from "./breadcrumbs"
import { redactURL } from "./redact"

export interface NetworkRequestPayload {
  url: string // query params with sensitive keys are redacted
  method: string // uppercase HTTP method
  status?: number // absent when the request never received a response
  duration?: number // ms, rounded
  failure_reason: "network_error" | "non_ok_status"
}

type OnFailure = (payload: NetworkRequestPayload) => void
type OnBreadcrumb = (entry: Omit<BreadcrumbEntry, "timestamp">) => void

// Resolves the request URL to a string regardless of the input type accepted
// by the fetch() API (string, URL object, or Request object).
function resolveURL(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return (input as Request).url
}

function instrumentFetch(
  onFailure: OnFailure,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  const original = window.fetch

  window.fetch = async function (input, init) {
    const url = redactURL(resolveURL(input))
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase()
    const start = performance.now()

    try {
      const response = await original.call(this, input, init)
      const duration = Math.round(performance.now() - start)

      onBreadcrumb({
        type: "network",
        message: `${method} ${url}`,
        data: { status: response.status, duration_ms: duration },
      })

      if (!response.ok) {
        onFailure({
          url,
          method,
          status: response.status,
          duration,
          failure_reason: "non_ok_status",
        })
      }

      return response
    } catch (err) {
      const duration = Math.round(performance.now() - start)
      onBreadcrumb({
        type: "network",
        message: `${method} ${url} failed`,
        data: { duration_ms: duration },
      })
      onFailure({ url, method, duration, failure_reason: "network_error" })
      throw err
    }
  }

  return () => {
    window.fetch = original
  }
}

// WeakMap avoids augmenting XHR instances with non-standard properties, which
// would appear in serialised output and risk leaking internal SDK state.
const xhrMeta = new WeakMap<
  XMLHttpRequest,
  { method: string; url: string; start: number }
>()

// Unified open signature that covers both the 2-arg and 5-arg overloads.
type OpenFn = (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
) => void

function instrumentXHR(
  onFailure: OnFailure,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  // Extracted so contextual typing from the overloaded open signature does not
  // widen the isAsync parameter type to `unknown`.
  function openWrapper(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    isAsync = true,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrMeta.set(this, {
      method: method.toUpperCase(),
      url: redactURL(String(url)),
      start: 0,
    })
    ;(originalOpen as OpenFn).call(
      this,
      method,
      url,
      isAsync,
      username,
      password,
    )
  }
  XMLHttpRequest.prototype.open =
    openWrapper as typeof XMLHttpRequest.prototype.open

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const meta = xhrMeta.get(this)
    if (meta) {
      meta.start = performance.now()
      this.addEventListener("loadend", () => {
        const duration = Math.round(performance.now() - meta.start)
        const isNetworkError = this.status === 0

        onBreadcrumb({
          type: "network",
          message: `${meta.method} ${meta.url}`,
          data: { status: this.status, duration_ms: duration },
        })

        if (isNetworkError || this.status >= 400) {
          onFailure({
            url: meta.url,
            method: meta.method,
            status: isNetworkError ? undefined : this.status,
            duration,
            failure_reason: isNetworkError ? "network_error" : "non_ok_status",
          })
        }
      })
    }
    originalSend.call(this, body)
  }

  return () => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  }
}

export function installNetworkInstrumentation(
  onFailure: OnFailure,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  const cleanups: Array<() => void> = []

  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    cleanups.push(instrumentFetch(onFailure, onBreadcrumb))
  }

  if (typeof XMLHttpRequest !== "undefined") {
    cleanups.push(instrumentXHR(onFailure, onBreadcrumb))
  }

  return () => {
    for (const fn of cleanups) fn()
  }
}
