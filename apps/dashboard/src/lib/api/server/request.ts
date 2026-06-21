import {
  getCookie,
  getRequestHeader,
  setResponseHeader,
} from "@tanstack/react-start/server"
import { ApiError } from "../error"

// Backend-for-frontend (BFF) transport. This module ONLY runs on the TanStack
// Start (Nitro) server, inside server functions — never in the browser. It is
// the single hop between Start and the internal Go Dashboard API.
//
// Responsibilities:
//   - Forward the browser's Cookie header so Go sees the watch_session cookie
//     (server-to-server fetches don't carry browser cookies on their own).
//   - Attach X-CSRF-Token on mutating methods, read server-side from the
//     watch_csrf cookie (which is HttpOnly — the browser never reads it).
//   - Relay Go's Set-Cookie headers back to the browser, so login/logout cookies
//     land on the Start origin (the only origin the browser talks to).
//   - Bound every upstream call with a timeout and normalize failures to ApiError.
//
// The browser reaches Go exclusively through this path, so Go needs no CORS and
// the dashboard needs no client-side API origin.

// Server-only address of the Go API. Not VITE_-prefixed: it must never be
// exposed to the client bundle.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:8080"

const CSRF_COOKIE_NAME = "watch_csrf"
const CSRF_HEADER_NAME = "X-CSRF-Token"
const UPSTREAM_TIMEOUT_MS = 5_000

export async function serverRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Forward the incoming browser cookies to the Go API.
    cookie: getRequestHeader("cookie") ?? "",
  }

  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCookie(CSRF_COOKIE_NAME)
    if (csrf) headers[CSRF_HEADER_NAME] = csrf
  }

  const res = await fetch(`${INTERNAL_API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // AbortSignal.timeout is the Fetch-spec deadline; fires a TimeoutError
    // DOMException so a slow/down backend doesn't hang the SSR render.
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })

  // Relay any Set-Cookie from Go (login sets watch_session + watch_csrf; logout
  // clears them) back to the browser response. getSetCookie() returns each
  // cookie separately; setResponseHeader accepts the array.
  const setCookies = res.headers.getSetCookie()
  if (setCookies.length > 0) {
    setResponseHeader("set-cookie", setCookies)
  }

  if (res.status === 204) {
    return undefined as T
  }
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    const message =
      raw !== null &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error?: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "request failed"
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}
