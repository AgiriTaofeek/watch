const MAX_STRING_LENGTH = 1000

// Header and field names that must never appear in collected data.
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "access_token",
  "auth",
  "x-auth-token",
  "x-api-key",
])

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

// Truncates a string that exceeds the safe maximum length.
export function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value
}

// Redacts or truncates values in a shallow string-keyed object.
// Sensitive keys become "[redacted]"; long string values are truncated.
export function redactObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = "[redacted]"
    } else if (typeof value === "string") {
      result[key] = truncateString(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// Strips any sensitive query-string parameters from a URL string.
// Unknown parameters are preserved; known-sensitive ones become "[redacted]".
// The query string is rebuilt manually so the placeholder is not percent-encoded.
export function redactURL(rawURL: string): string {
  try {
    const url = new URL(rawURL, "http://x") // base needed for relative URLs
    let changed = false
    const pairs: string[] = []
    url.searchParams.forEach((value, key) => {
      if (isSensitiveKey(key)) {
        pairs.push(`${encodeURIComponent(key)}=[redacted]`)
        changed = true
      } else {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      }
    })
    if (!changed) return truncateString(rawURL)
    const result = `${url.pathname}?${pairs.join("&")}`
    return truncateString(result)
  } catch {
    return truncateString(rawURL)
  }
}
