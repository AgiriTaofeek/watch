// Normalized error for any non-2xx response from the Go Dashboard API. Lives in
// its own module (no server-only imports) so it can be thrown by the server-side
// request helper and caught anywhere — server functions, query code, or React.
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
