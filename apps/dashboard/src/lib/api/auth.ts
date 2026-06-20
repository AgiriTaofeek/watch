import { ApiError, clearCsrfToken, request, setCsrfToken } from "./client"
import type { User } from "./types"

export type Credentials = { email: string; password: string }

// Returns the authenticated user, or null when the session has expired / is absent.
export async function fetchMe(): Promise<User | null> {
  try {
    return await request<User>("GET", "/me")
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) return null
    throw err
  }
}

// Creates the first owner account. Throws ApiError(409) if setup is already done.
export async function setup(credentials: Credentials): Promise<User> {
  return request<User>("POST", "/auth/setup", credentials)
}

// Validates credentials, stores the CSRF token in memory, and returns the user.
export async function login(credentials: Credentials): Promise<User> {
  const result = await request<{ user: User; csrf_token: string }>(
    "POST",
    "/auth/login",
    credentials,
  )
  setCsrfToken(result.csrf_token)
  return result.user
}

// Ends the session and clears the in-memory CSRF token.
export async function logout(): Promise<void> {
  await request<void>("POST", "/auth/logout")
  clearCsrfToken()
}
