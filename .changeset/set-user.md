---
"@watch/browser": minor
"@watch/react": minor
---

Add `setUser({ idHash })` to associate subsequent events with a pseudonymous user
hash (PII-free — only an opaque hash is accepted, never a raw id, email, or name).
Pass `null` to clear it (e.g. on logout). Exposed from both `@watch/browser` and
`@watch/react`, and surfaced in the event envelope as `context.user_id_hash`.
