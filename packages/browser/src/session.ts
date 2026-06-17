const SESSION_KEY = "__watch_sid"

// Returns a stable anonymous ID for the current browser tab session.
// Stored in sessionStorage so it resets on tab close but persists across
// in-page navigations.
export function getSessionID(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    // sessionStorage may be blocked in private-mode or restricted iframes.
    return crypto.randomUUID()
  }
}
