import { createServerFn } from "@tanstack/react-start"
import { ApiError } from "./error"
import { attempt } from "./result"
import { serverRequest } from "./server/request"
import type { User } from "./types"

export type Credentials = { email: string; password: string }

// Returns the authenticated user, or null when the session is absent/expired.
// Runs server-side during SSR and as an RPC on client navigations; either way
// serverRequest forwards the browser's session cookie to Go.
export const fetchMe = createServerFn({ method: "GET" }).handler(
  async (): Promise<User | null> => {
    try {
      return await serverRequest<User>("GET", "/me")
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isUnauthorized) return null // not logged in
        throw err // a real API error (e.g. 5xx) — surface it
      }
      // Network failure (backend unreachable) or timeout: degrade to logged-out
      // so route guards show /login instead of crashing SSR with an uncaught error.
      return null
    }
  },
)

// Creates the first owner account. Returns { ok: false, status: 409 } if setup is
// already done — a Result (not a throw) so the status survives the RPC boundary
// and the form can route the user to /login.
export const setup = createServerFn({ method: "POST" })
  .validator((data: Credentials) => data)
  .handler(({ data }) =>
    attempt(() => serverRequest<User>("POST", "/auth/setup", data)),
  )

// Validates credentials and returns the user. Go sets the session and watch_csrf
// cookies; serverRequest relays those Set-Cookie headers to the browser. Returns
// a Result so a 401 ("invalid credentials") reaches the form as data, not a
// class-stripped error.
export const login = createServerFn({ method: "POST" })
  .validator((data: Credentials) => data)
  .handler(({ data }) =>
    attempt(async () => {
      const result = await serverRequest<{ user: User }>(
        "POST",
        "/auth/login",
        data,
      )
      return result.user
    }),
  )

// Ends the session. Go clears the session and watch_csrf cookies (relayed back).
export const logout = createServerFn({ method: "POST" }).handler(() =>
  serverRequest<void>("POST", "/auth/logout"),
)
