import { ApiError } from "./error"

// Why this exists: a server function that *throws* an ApiError loses its class
// and `status` when the error is serialized across the RPC boundary — the client
// receives a generic error with only the message. So for operations where the UI
// must branch on the HTTP status (e.g. 401 "wrong password", 409 "already set
// up"), the server function returns a Result instead of throwing. The status is
// plain data, so it survives serialization intact.
//
// Use this for mutations whose caller discriminates by status. Read/query server
// functions can keep throwing — TanStack Query only needs *an* error to enter its
// error state, and the message survives.
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

// Runs fn (server-side, where `instanceof ApiError` is reliable) and converts an
// ApiError into a serializable failure. Truly unexpected errors (network failure,
// timeout) still throw, so callers surface a generic error for those.
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, message: err.message }
    }
    throw err
  }
}
