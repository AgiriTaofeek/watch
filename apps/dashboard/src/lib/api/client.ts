export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }

  get isUnauthorized() {
    return this.status === 401
  }
  get isForbidden() {
    return this.status === 403
  }
  get isNotFound() {
    return this.status === 404
  }
  get isConflict() {
    return this.status === 409
  }
}

// CSRF token lives in memory only. Set after login, cleared on logout.
// A page refresh loses the token — the app re-bootstraps via GET /me.
let csrfToken: string | null = null

export function setCsrfToken(token: string): void {
  csrfToken = token
}

export function clearCsrfToken(): void {
  csrfToken = null
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = csrfToken
  }
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
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
