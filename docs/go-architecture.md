# Go Architecture Guide

This document covers Go-specific architecture decisions, standing patterns, and
known refactor targets for the Watch server (`apps/server`). Read it alongside
[architecture.md](architecture.md) (system shape) and [AGENTS.md](../AGENTS.md)
(engineering standards and Go conventions).

---

## Standing patterns

These are the rules that govern how new Go code should be written. They are
derived from decisions already made in the codebase and from issues found during
review. Follow them for any new package, handler, or store method.

---

### Narrow store interfaces per caller

The `store` package exports `*Store` as a concrete type with all database
methods. Callers — the `api` and `worker` packages — define their own narrow
interfaces that `*Store` satisfies. This is the correct Go pattern: accept
interfaces, return concrete types.

**The rule:** each caller interface should include only the methods that caller
actually needs. Do not add a method to `api.Store` or `worker.Store` unless a
handler or worker loop in that package calls it.

```go
// Good — only what the ingest handler needs
type IngestStore interface {
    LookupIngestionKey(ctx context.Context, publicKey string) (store.KeyLookup, error)
    InsertRawEvent(ctx context.Context, e store.RawEvent) error
    IncrementDroppedCounter(ctx context.Context, environmentID *string, reason string, day time.Time) error
}

// Bad — one interface for everything; every test stub must implement all methods
type Store interface {
    LookupIngestionKey(...)
    InsertRawEvent(...)
    // ... 20 more methods unrelated to ingestion
}
```

As the API surface grows (alerts, releases, source maps), split `api.Store` by
concern — ingestion, auth, projects, issues, rollups, alerts — so test fakes
for each area stay small and handler tests don't need to stub unrelated methods.

---

### Database transactions via `WithTx`, not raw pool access

Any operation that must be atomic — creating a project and its default
environment, delivering an alert and recording its cooldown, rotating a key and
revoking the old one — must run inside a Postgres transaction.

The correct pattern is a `WithTx` helper on `*Store`. **Never expose the raw
connection pool** to callers outside the `store` package. If a caller needs a
transaction, it calls `WithTx`. There is no other valid reason to reach the
pool directly.

```go
// store/store.go
func (s *Store) WithTx(ctx context.Context, fn func(pgx.Tx) error) error {
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return fmt.Errorf("begin tx: %w", err)
    }
    if err := fn(tx); err != nil {
        _ = tx.Rollback(ctx)
        return err
    }
    return tx.Commit(ctx)
}
```

Usage in a store method that needs atomicity:

```go
func (s *Store) CreateProjectWithDefaults(ctx context.Context, name string) (ProjectDetail, error) {
    var detail ProjectDetail
    err := s.WithTx(ctx, func(tx pgx.Tx) error {
        // insert project, then environment, then key — all in one transaction
        return nil
    })
    return detail, err
}
```

---

### Explicit DB deadlines per handler

The HTTP server sets `ReadTimeout` and `WriteTimeout` at the transport layer,
but those do not cancel an in-flight database query — they close the connection
after the deadline, leaving the query running until Postgres times it out
independently. Under load, slow queries hold pool connections open and starve
other requests.

Every handler that touches the database must derive a tight context with a
deadline before its first store call:

```go
func (a *API) handleGetIssue(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    issue, err := a.store.GetIssue(ctx, id)
    // ...
}
```

Suggested limits by operation type:

| Operation | Deadline |
|---|---|
| Health check | 2s |
| Ingestion write | 3s |
| Auth (login, session lookup) | 3s |
| Dashboard reads (issues, rollups) | 5s |
| Dashboard mutations (create, revoke) | 5s |
| Background worker batches | 30s per batch |

These are starting values, not law. Tune if measured p99 shows headroom.

---

### Worker graceful shutdown with `sync.WaitGroup`

The worker goroutines check `ctx.Done()` in their select loops. When the server
receives SIGTERM, the context is cancelled and goroutines exit at their next
tick. If a goroutine is mid-batch (halfway through writing rollup upserts), the
work is abandoned silently.

The correct pattern is to give `Start` a `WaitGroup` so in-flight batches
complete before the process exits, and return a `stop` function to `main`:

```go
// worker.go
func (w *Worker) Start(ctx context.Context) (stop func()) {
    var wg sync.WaitGroup
    launch := func(fn func(context.Context)) {
        wg.Add(1)
        go func() {
            defer wg.Done()
            fn(ctx)
        }()
    }
    launch(w.runIssueClassifier)
    launch(w.runRollupAggregator)
    launch(w.runRetentionCleaner)
    return wg.Wait
}
```

```go
// cmd/watch/main.go
stopWorker := w.Start(ctx)
// ... HTTP server runs until signal ...
srv.Shutdown(shutdownCtx)
stopWorker() // blocks until all worker goroutines finish their current batch
```

Each goroutine's inner loop must check `ctx.Done()` at the start of each batch,
not only in the outer select, so cancellation is respected mid-loop:

```go
func (w *Worker) runRollupAggregator(ctx context.Context) {
    ticker := time.NewTicker(60 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            if ctx.Err() != nil {
                return // cancelled while waiting; skip batch
            }
            prevHour := time.Now().UTC().Truncate(time.Hour).Add(-time.Hour)
            w.aggregateRollups(ctx, prevHour) // ctx carries the cancellation
        case <-ctx.Done():
            return
        }
    }
}
```

---

### Constructor options: plain struct, not variadic

When a constructor takes optional configuration, use a plain struct parameter,
not a variadic:

```go
// Good — honest, no surprise if caller passes two Options
func New(st Store, opts Options) *API

// Bad — looks like functional options but only the first value is used
func New(st Store, opts ...Options) *API
```

Use functional options (`func(*Options)`) only when callers compose many
independent toggles and the zero value of each is a safe default. For Watch's
current `Options` struct (two fields, always set by `main`), a plain struct is
correct.

---

### `init()` usage

See [AGENTS.md — Go conventions — `init()` usage](../AGENTS.md) for the rules.
Short version: only for package-level setup that cannot fail (compile a regex,
install a safe logger default). Never for config loading, DB connections, or
anything that makes a package untestable to import.

---

## Known refactor targets

These are specific issues identified in the current codebase that should be
resolved before or alongside the next milestone. They are documented here so
they are not forgotten and can be picked up by any contributor.

---

### `Store.Pool()` — delete it

**File:** `apps/server/internal/store/store.go`

```go
// This method should not exist.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }
```

`Pool()` exports the raw connection pool, bypassing the `store` package
boundary. No caller outside the `store` package should ever touch `pgxpool`
directly. The method exists but nothing currently calls it externally.

**Action:** delete `Pool()`. If anything needs a transaction, it should call
`WithTx` (see above). If a new caller appears that wants to bypass the store,
that is a design smell to reject, not a reason to keep the method.

---

### `api.Store` — split by concern

**File:** `apps/server/internal/api/api.go`

The single `Store` interface currently has 20+ methods covering ingestion, auth,
projects, issues, rollups, analytics, and system health. Every new endpoint adds
another method, which requires another stub in `fakeStore` in `api_test.go` even
when the test has nothing to do with that method.

**Action:** split into per-concern interfaces as handler groups grow. Suggested
grouping:

```go
type IngestStore interface { /* 3 methods */ }
type AuthStore   interface { /* 6 methods */ }
type ProjectStore interface { /* 5 methods */ }
type IssueStore  interface { /* 3 methods */ }
type RollupStore interface { /* 5 methods */ }
type SystemStore interface { /* 1 method  */ }
```

Each handler or handler group receives the narrowest interface it needs. The
`API` struct can embed all of them or hold a single `*store.Store` and assert
the narrower interface at the call site, depending on how handlers are
structured at the time of the refactor.

Do this refactor as a standalone PR with no behavior change. Verify with
`go test ./...` before and after.

---

### Timestamps as strings — future migration

**Files:** `apps/server/internal/store/projects.go`, `users.go`, `sessions.go`,
`issues.go`

IDs and timestamps are scanned into `string` / `*string` by casting at the SQL
boundary (`uuid::text`, `timestamptz::text`). This sidesteps pgx type mapping
and keeps the structs dependency-free, but it means Go code cannot do date
arithmetic on `CreatedAt`, `RevokedAt`, or `ExpiresAt` without parsing.

This is a conscious tradeoff that works for v1 JSON serialization. When a
feature needs to do date arithmetic in Go (e.g., computing time-since-first-seen
for issue aging, or checking whether a session is expiring soon without a DB
round-trip), migrate those specific fields to `time.Time` and update the scan.

**Action:** do not change wholesale now — the churn is large and the benefit
is not yet felt. Track it. Migrate field-by-field when a feature needs it.

---

### Missing DB index for worker queries

**File:** `apps/server/internal/store/migrations/` — add a new migration

The worker queries `raw_events` on `(event_type, event_timestamp)`:

```sql
WHERE event_type = 'web_vital'
  AND event_timestamp >= $1
  AND event_timestamp <  $2
```

The current indexes are on `(project_id, received_at)` and
`(environment_id, received_at)`. The worker's queries do a sequential scan as
the table grows.

**Action:** add a migration:

```sql
CREATE INDEX idx_raw_events_type_timestamp
    ON raw_events (event_type, event_timestamp);
```

Add this before sustained traffic reaches the host. At 1M events/day the
sequential scan is measurable; at 5M it becomes the bottleneck.

---

### Offset pagination on issues — future migration

**File:** `apps/server/internal/api/issues.go`,
`apps/server/internal/store/issues.go`

`ListIssues` uses `OFFSET`/`LIMIT`. Deep pages scan all preceding rows.

**Action:** replace with keyset (cursor) pagination when the issues table grows
or when the dashboard implements infinite scroll. The cursor key should be
`(first_seen_at DESC, id)` — stable sort order, no ties, uses the existing
index. This is a breaking API change; plan a migration path for the dashboard
query at the same time.

---

---

## Bug inventory

These are confirmed bugs or dangerous code patterns found by code audit. Each
entry records what is wrong, why it matters, and the correct fix. Bugs marked
**fixed** have been resolved in the codebase.

---

### `loginRateLimiter.recordFailure` — map grows past its bound [FIXED]

**File:** `apps/server/internal/api/loginratelimit.go:73-85`  
**Severity:** high

The limiter is designed to hold at most `loginLimiterMaxEntries` (10,000)
entries. When the map reaches the limit, it prunes expired entries — but then
**unconditionally inserts the new entry** even if pruning removed nothing:

```go
// Bug: entry is inserted even if pruneExpiredLocked() freed zero slots.
if len(l.attempts) >= loginLimiterMaxEntries {
    l.pruneExpiredLocked()
}
l.attempts[key] = &loginAttempt{count: 1, windowStart: l.now()}
```

Under a sustained attack with more than 10,000 distinct email addresses all
within the active 15-minute window, pruning removes zero entries, but the new
entry is still appended. The map grows by one per call, without bound. This is
a memory-exhaustion DoS.

**Fix (applied):** Re-check the map size after pruning. If still at capacity,
drop the new entry silently. An untracked email goes unprotected, but that is
preferable to an OOM that kills the whole server process.

```go
if len(l.attempts) >= loginLimiterMaxEntries {
    l.pruneExpiredLocked()
    if len(l.attempts) >= loginLimiterMaxEntries {
        return // map full; skip rather than grow memory without bound
    }
}
l.attempts[key] = &loginAttempt{count: 1, windowStart: l.now()}
```

---

### `exists()` interpolates table name via `fmt.Sprintf`

**File:** `apps/server/internal/store/projects.go:299-313`  
**Severity:** medium (footgun — not currently exploitable)

```go
func (s *Store) exists(ctx context.Context, table, id string) (bool, error) {
    // ...
    err := s.pool.QueryRow(ctx,
        fmt.Sprintf(`SELECT 1 FROM %s WHERE id = $1::uuid`, table), id).Scan(&one)
```

The `id` argument is safely parameterized. The `table` argument is not — it is
interpolated directly into the SQL string. Today all callers pass hardcoded
string literals (`"projects"`, `"environments"`), so there is no injection path.
But the function signature accepts any `string`, and a future refactor that
passes a variable could introduce SQL injection with no type-system warning.

**Fix:** add a whitelist guard at the top of `exists`:

```go
var validTables = map[string]bool{
    "projects":     true,
    "environments": true,
}

func (s *Store) exists(ctx context.Context, table, id string) (bool, error) {
    if !validTables[table] {
        return false, fmt.Errorf("exists: unknown table %q", table)
    }
    // ...
}
```

This makes the function safe regardless of where `table` comes from.

---

### Context-value ok bool discarded in `handleLogout` and `handleMe`

**File:** `apps/server/internal/api/auth.go:152,182`  
**Severity:** low (not a runtime bug today, but a fragile pattern)

```go
// handleLogout
sess, _ := SessionFromContext(r.Context()) // ok discarded
if err := a.store.DeleteSession(r.Context(), sess.ID); err != nil { ... }

// handleMe
user, _ := UserFromContext(r.Context()) // ok discarded
writeJSON(w, http.StatusOK, user)
```

Both routes are wrapped with `sessionRequired` middleware, which guarantees the
session and user are in context before the handler runs. Today, the `_` is
always a `true` that gets thrown away. But if someone moves either handler
outside the middleware chain — a common mistake when refactoring routes — `sess`
and `user` silently become zero values (`ID: ""`, `Email: ""`). `handleLogout`
would call `DeleteSession("")` (harmless no-op, then clear cookies). `handleMe`
would return `{"id":"","email":""}` as the authenticated user — a data leak
that is hard to detect.

**Fix:** check `ok` explicitly:

```go
func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
    sess, ok := SessionFromContext(r.Context())
    if !ok {
        writeError(w, http.StatusUnauthorized, "authentication required")
        return
    }
    // ...
}
```

The guard is redundant under the current routing, but it makes the handler safe
to move and catches middleware-chain errors at the call site rather than silently.

---

### CORS origin comparison is case-sensitive

**File:** `apps/server/internal/api/ingest.go:179-189`  
**Severity:** low (not exploitable from browsers, minor compatibility risk)

```go
func originAllowed(origin string, allowed []string) bool {
    for _, candidate := range allowed {
        if origin == candidate { // exact string equality
            return true
        }
    }
    return false
}
```

RFC 6454 specifies that the scheme and host components of an origin are
case-insensitive. Browsers always normalize the `Origin` header to lowercase
before sending, so in practice `https://Example.com` is never received from a
browser. However, if an allowed origin is stored in the database with mixed case
(e.g., entered as `HTTPS://app.example.com` via the dashboard), the comparison
will fail even for legitimate browser requests, silently dropping events.

**Fix:** normalize both sides before comparing:

```go
import "strings"

func originAllowed(origin string, allowed []string) bool {
    norm := strings.ToLower(origin)
    for _, candidate := range allowed {
        if norm == strings.ToLower(candidate) {
            return true
        }
    }
    return false
}
```

This is also more correct if Watch ever adds non-browser SDK clients that may
not normalize Origin casing.

---

## Milestone readiness checklist

Before each milestone ships, verify these are in place:

- [ ] No caller outside `store` package holds a reference to `pgxpool.Pool`
- [ ] Every handler that touches the DB has an explicit `context.WithTimeout`
- [ ] Any new atomic operation uses `WithTx`, not individual store calls
- [ ] New store methods added to the narrowest interface that needs them
- [ ] Worker `Start` returns a drain function called during shutdown
- [ ] Any new `init()` function is justified against the rules in AGENTS.md
- [ ] `exists()` callers still pass only whitelisted table names (or whitelist is updated)
- [ ] `SessionFromContext` and `UserFromContext` return values are checked — not discarded with `_`
- [ ] Any new origin comparison uses case-insensitive matching
