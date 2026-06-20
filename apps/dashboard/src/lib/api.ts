export type CurrentUser = {
  email: string
  id: string
}

// Returns the authenticated user, or null when the session has expired / is absent.
export async function fetchMe(): Promise<CurrentUser | null> {
  const res = await fetch("/api/me")
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`)
  return res.json() as Promise<CurrentUser>
}
