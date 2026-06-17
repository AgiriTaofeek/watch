# Milestone 5: Rollups and Issues

A learning reference for M5 of Watch. M1–M4 built the ingestion pipeline and framework integrations. M5 adds the first layer of intelligence: a background worker that groups frontend errors into *issues* and computes hourly metric rollups from raw events.

---

## 2. Vocabulary

- **Issue** — a group of frontend_error events that share the same *fingerprint*. An issue has a lifecycle (open → resolved → ignored) and tracks how many events and users it has affected.
- **Fingerprint** — a short stable hash that identifies a class of error. Two events with the same error name, similar message, and same route produce the same fingerprint and are grouped into one issue.
- **Rollup** — a pre-aggregated time-series bucket. Instead of querying all raw_events on every dashboard load, the worker periodically aggregates them into hourly summary rows that the API can serve instantly.
- **Partial index** — a Postgres index with a `WHERE` clause, so it only covers a subset of rows. `idx_raw_events_unprocessed` only indexes the unclassified `frontend_error` rows the worker scans, not the entire table.
- **`ON CONFLICT ... DO UPDATE`** — Postgres upsert syntax. The INSERT succeeds on new rows; the DO UPDATE clause fires on unique-constraint conflicts so rollups are idempotent when the aggregator re-runs for the same hour.
- **p75** — the 75th percentile: 75% of samples fall at or below this value. The standard benchmark for Web Vitals (Google measures "good" at p75 or better). Computed in Go from a capped sample array rather than stored pre-computed.
- **Context cancellation** — a Go idiom for cooperative shutdown. `context.Context` carries a cancellation signal; every goroutine checks `ctx.Done()` and exits cleanly when the signal fires (e.g. on SIGINT).
- **Retention** — automatic deletion of data that has aged past a configured window. Watch deletes `raw_events` older than `WATCH_EVENT_RETENTION_DAYS` (default 90) to keep the database bounded.

---

## 3. Mental Model: What Does M5 Add?

```
raw_events table (existing, grows continuously)
        │
        │  Worker runs every 30 s
        ▼
Issue Classifier
  reads WHERE issue_id IS NULL AND event_type = 'frontend_error'
  FingerprintError(name, message, route) → hash
  UpsertIssue (INSERT … ON CONFLICT DO UPDATE)
  AssignIssue (sets raw_events.issue_id)
        │
        │  Worker runs every 5 min
        ▼
Rollup Aggregator
  FetchErrorCounts(prevHour)   → UpsertErrorRollup
  FetchVitalSamples(prevHour)  → UpsertVitalRollup

        │  Worker runs every 24 h
        ▼
Retention Cleaner
  DELETE FROM raw_events WHERE received_at < now() - retention

New API endpoints
  GET  /api/projects/{id}/issues
  GET  /api/issues/{id}
  PATCH /api/issues/{id}/status
  GET  /api/projects/{id}/rollups/errors
  GET  /api/projects/{id}/rollups/vitals
```

---

## 4. Package Structure

| File | Responsibility |
|------|---------------|
| `store/migrations/0004_rollups_and_issues.up.sql` | Schema: issues, error_rollups, vital_rollups, raw_events.issue_id |
| `store/issues.go` | Issue type + UpsertIssue, ListIssues, GetIssue, UpdateIssueStatus |
| `store/rollups.go` | Rollup types + FetchVitalSamples, FetchErrorCounts, UpsertErrorRollup, UpsertVitalRollup, QueryErrorRollups, QueryVitalRollups |
| `store/events.go` | FetchUnprocessedErrors, AssignIssue, DeleteExpiredEvents (added) |
| `worker/fingerprint.go` | FingerprintError + normalizeMessage |
| `worker/worker.go` | Worker struct + three background loops + Store interface |
| `api/issues.go` | handleListIssues, handleGetIssue, handleUpdateIssueStatus |
| `api/rollups.go` | handleGetErrorRollups, handleGetVitalRollups |
| `config/config.go` | EventRetentionDays (added) |
| `cmd/watch/main.go` | worker.New + w.Start(ctx) (added) |

---

## 5. Key Design Decisions

### Why a background worker instead of inline classification?

Classifying an error into an issue requires a database upsert with a conflict check. At ingestion time, adding that to every `POST /ingest/{key}` request would increase p99 latency and create a write hotspot on the issues table. The background worker processes events in batches every 30 seconds — a small delay the product doesn't care about (issues don't need to appear in milliseconds) in exchange for keeping the ingestion path fast and simple.

### Error fingerprinting

Two error events should group together if they represent the same bug, even if the error message contains variable runtime values:

```
"Cannot read property 'foo' of undefined"  ←  same bug
"Cannot read property 'bar' of undefined"
```

`normalizeMessage` strips quoted strings, UUIDs, hex addresses, and large standalone numbers before hashing. The fingerprint key is:

```
"<name>|<normalizedMessage>|<route>"
```

SHA-256 of that key, taking the first 8 bytes (16 hex chars), gives a fingerprint that is stable, short, and collision-resistant at the scale Watch targets.

### Upsert pattern for issues

```sql
INSERT INTO issues (project_id, environment_id, fingerprint, title, …)
VALUES (…)
ON CONFLICT (project_id, environment_id, fingerprint) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    event_count  = issues.event_count + 1,
    status       = CASE WHEN issues.status = 'resolved' THEN 'open' ELSE issues.status END,
    updated_at   = now()
RETURNING id
```

Two important rules encoded here:
1. `event_count` increments atomically — no read-modify-write race.
2. A `resolved` issue is re-opened when new events arrive — a regression should surface again rather than silently accumulating behind a closed issue.

### Worker goroutine lifecycle

```go
func (w *Worker) runIssueClassifier(ctx context.Context) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            w.classifyErrors(ctx)
        case <-ctx.Done():
            return
        }
    }
}
```

Each loop uses `select` on two channels: the ticker fires the work; `ctx.Done()` triggers exit. The same `ctx` is cancelled by the SIGINT/SIGTERM handler in `main.go`, so all three loops stop when the server shuts down. `ticker.Stop()` prevents the ticker goroutine from leaking.

### Dependency direction: worker → store

The shared data types (`UnprocessedError`, `UpsertIssueParams`, `VitalSample`, etc.) live in the `store` package, not `worker`. This means `worker` imports `store` (the natural direction — the worker is a consumer of the store), and `store` has no knowledge of `worker`. A circular import (`store` ↔ `worker`) is avoided without needing a third "domain" package.

### p75 from capped sample arrays

Exact percentile computation requires seeing all values. Storing every raw vital value in the rollup table would be unbounded. Instead, `vital_rollups.samples` stores up to 200 values per (project, env, route, release, hour, metric) bucket. After 200 the array stops growing — the estimate degrades gracefully under high volume, but for v1 project sizes it is exact.

p75 is computed in Go at query time, not stored:

```go
func p75(samples []float64) float64 {
    sorted := ...
    idx := int(math.Ceil(0.75 * float64(len(sorted)))) - 1
    return sorted[idx]
}
```

### Re-running the aggregator is safe (idempotent)

The rollup upsert uses `DO UPDATE SET error_count = EXCLUDED.error_count` (not `+= EXCLUDED.error_count`). Re-running the aggregator for the same hour overwrites the rollup with the same value — it does not double-count. This makes the worker safe to restart, re-run after a crash, or backfill.

---

## 6. Task Breakdown

### Task 1 — `feat/m5-schema`
Migration 0004: `issues`, `error_rollups`, `vital_rollups` tables, `raw_events.issue_id` column, and the partial index on unprocessed errors.

### Task 2 — `feat/m5-fingerprint`
`worker/fingerprint.go`: `normalizeMessage` with compiled regexes; `FingerprintError` using SHA-256. Tests confirm normalization rules and output format.

### Task 3 — `feat/m5-worker`
`worker/worker.go`: `Worker` struct and `Store` interface; three goroutine loops; `config.go` `EventRetentionDays`; wired into `main.go` with `w.Start(ctx)`.

### Task 4 — `feat/m5-issue-store`
`store/issues.go`: `Issue` type, `UpsertIssue` (upsert + re-open logic), `ListIssues` (paginated with status filter), `GetIssue`, `UpdateIssueStatus`. `store/events.go`: `FetchUnprocessedErrors`, `AssignIssue`, `DeleteExpiredEvents`.

### Task 5 — `feat/m5-rollup-store`
`store/rollups.go`: `VitalSample`, `ErrorCount`, rollup types; `FetchVitalSamples`, `FetchErrorCounts`, `UpsertErrorRollup`, `UpsertVitalRollup`, `QueryErrorRollups`, `QueryVitalRollups` with p75 computed in Go.

### Task 6 — `feat/m5-api`
`api/issues.go` (list, get, update status); `api/rollups.go` (error buckets, vital buckets with per-bucket health score); routes registered in `api.go`; `fakeStore` stubs added to existing tests.
