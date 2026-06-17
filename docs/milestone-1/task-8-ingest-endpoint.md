# Task 8 — Ingest Endpoint

The server gets its first SDK-facing route: `POST /ingest/{key}`. Every event the browser SDK captures eventually lands here. This task wires key validation, payload size checks, envelope schema validation, raw-event storage, and dropped-event counters — the full acceptance pipeline.

For the broader context see [README.md](README.md) — especially [§5 the ingestion flow](README.md#5-requestresponse-flows). Builds on the store and API packages from Tasks 3–7.

## Goal

> Accept events from the SDK at `POST /ingest/{key}`.
>
> Done when a valid key + valid envelope returns `204` and a row appears in `raw_events`, and every rejection path increments `dropped_event_counters` with the right reason.

| Condition | Status | Counter reason |
|-----------|--------|----------------|
| Valid key + valid envelope | 204 | — |
| Unknown public key | 401 | `unknown_key` |
| Revoked key | 401 | `revoked_key` |
| Body > 100 KB | 413 | `oversized_payload` |
| Invalid / missing JSON fields | 400 | `invalid_schema` |

## Why this task exists

Tasks 1–7 built the skeleton: schema, pool, migrations, health check, and project/key CRUD. None of that accepts data. This task is the pipeline the SDK actually uses. Without it, `packages/browser` has no endpoint to call.

The two tables this task writes to — `raw_events` and `dropped_event_counters` — were designed for exactly this in Task 5. Every field on both tables is exercised here.

## Concept primer

- **`io.LimitReader`** — wraps an `io.Reader` so at most *n* bytes can be read from it. Reading stops at *n* even if the underlying stream has more. We use this to cap ingest payloads at 100 KB + 1 byte: if we read back 100 KB + 1 bytes, the body was too large.
- **`json.NewDecoder` with `DisallowUnknownFields`** — the ingest endpoint reads a bounded body, then decodes a strict top-level envelope so unexpected fields are rejected instead of silently stored.
- **`INSERT ... ON CONFLICT DO UPDATE`** — an upsert. If the target row already exists (same `(environment_id, reason, day)` key), `DO UPDATE` runs instead of returning a conflict error. We use it to atomically increment the counter. The `NULLS NOT DISTINCT` on the index makes two NULL `environment_id` values count as the same key, so unknown-key drops aggregate correctly.
- **`::event_type` and `::drop_reason` casts** — these are Postgres custom enum types defined in the first migration. Passing a plain string `"frontend_error"` is fine; pgx will apply the cast and Postgres validates that the string is a member of the enum.
- **Sanitized payload** — the `payload jsonb` column stores the accepted envelope after server-side redaction. Rollups (M5) recompute from this privacy-safe source.
- **Origin allowlist** — projects may define allowed browser origins. An empty allowlist permits all origins for local development and curl/server-side clients; a configured allowlist blocks mismatched browser origins.

## File 1 — `apps/server/internal/store/events.go`

Two responsibilities: look up an ingestion key by its public value (used to validate + get IDs for insert), and write a raw event row.

```go
// KeyLookup holds the minimal data the ingest handler needs from an ingestion
// key row. IDs are strings cast at the SQL boundary (same pattern as projects.go).
type KeyLookup struct {
    KeyID         string
    EnvironmentID string
    ProjectID     string
    RevokedAt     *string // nil while active; non-nil means revoked
}

func (s *Store) LookupIngestionKey(ctx context.Context, publicKey string) (KeyLookup, error) {
    // JOIN environments to get project_id — ingestion_keys only has environment_id.
    // ::text casts keep us dependency-free (no pgtype.UUID needed).
}
```

`LookupIngestionKey` JOINs `environments` because `ingestion_keys` only carries `environment_id`; we need `project_id` for the raw event insert (it's denormalized onto `raw_events`). Returning `ErrNotFound` (already defined in `projects.go`) means the handler can use `errors.Is` without caring about pgx internals.

```go
type RawEvent struct {
    IngestionKeyID string
    EnvironmentID  string
    ProjectID      string
    EventType      string
    Release        *string
    EventTimestamp time.Time
    Payload        []byte // full envelope JSON, stored verbatim
}

func (s *Store) InsertRawEvent(ctx context.Context, e RawEvent) error {
    // Single INSERT — no transaction needed for a single-row write.
}
```

`Release` is a pointer because the envelope field is optional (`release?: string` in the TypeScript type). A nil pointer becomes SQL `NULL`.

## File 2 — `apps/server/internal/store/counters.go`

Single function, single upsert:

```go
func (s *Store) IncrementDroppedCounter(
    ctx context.Context,
    environmentID *string, // nil when the key was unknown
    reason string,
    day time.Time,
) error {
    // INSERT ... ON CONFLICT DO UPDATE SET count = count + 1
    // $3::date — Postgres extracts the date part; time-of-day is ignored.
}
```

`environmentID` is `*string` rather than `string` because the `unknown_key` drop path doesn't have an environment to attribute the counter to. Passing `nil` produces SQL `NULL`, which the `NULLS NOT DISTINCT` index treats as a single bucket.

The `day time.Time` passed by the caller is `time.Now().UTC()`. The `::date` cast in SQL strips the time-of-day portion so all drops within a calendar day merge into one row.

## File 3 — `apps/server/internal/api/ingest.go`

The handler + a private `dropAndRespond` helper.

```go
const maxIngestBodyBytes = 100 * 1024 // 100 KB

var validEventTypes = map[string]bool{
    "web_vital": true, "frontend_error": true, "network_request": true,
    "navigation": true, "asset_load": true, "breadcrumb": true, "deployment": true,
}

type ingestEnvelope struct {
    Service   string  `json:"service"`
    Timestamp string  `json:"timestamp"`
    Type      string  `json:"type"`
    Release   *string `json:"release"`
}
```

Only the fields needed for validation are decoded; the raw `body []byte` is what's stored.

### Handler flow

```
1. LookupIngestionKey(publicKey)
   → not found          → dropAndRespond(nil, "unknown_key", 401)
   → revoked            → dropAndRespond(&envID, "revoked_key", 401)

2. Check Origin header against the project's allowed origins
   → blocked            → dropAndRespond(&envID, "blocked_origin", 403)

3. io.ReadAll(io.LimitReader(r.Body, 100KB+1))
   → len(body) > 100KB  → dropAndRespond(&envID, "oversized_payload", 413)

4. Decode strict top-level envelope
   → decode error        → dropAndRespond(&envID, "invalid_schema", 400)

5. Validate: service=="frontend", type∈validEventTypes, timestamp parseable RFC3339
   → invalid             → dropAndRespond(&envID, "invalid_schema", 400)

6. InsertRawEvent(...)   → 204 No Content
```

### dropAndRespond

```go
func (a *API) dropAndRespond(
    ctx context.Context,
    w http.ResponseWriter,
    environmentID *string,
    reason string,
    status int,
    msg string,
) {
    // Counter failure is logged but doesn't change the SDK response.
    if err := a.store.IncrementDroppedCounter(ctx, environmentID, reason, time.Now().UTC()); err != nil {
        slog.ErrorContext(ctx, "failed to increment dropped counter", "error", err, "reason", reason, ...)
    }
    writeError(w, status, msg)
}
```

The counter is best-effort. If the DB is temporarily unavailable, the SDK still gets the right status code; the operator sees the error in logs.

## File 4 — `apps/server/internal/api/api.go` (update)

Add one line to `Handler()`:

```go
mux.HandleFunc("POST /ingest/{key}", a.handleIngest)
```

Register it before the `/api/*` routes — Go's `ServeMux` matches by specificity, so placement doesn't matter for routing correctness, but grouping ingestion above dashboard routes makes the intent clear.

## Verification

Start the stack and server, then exercise every path with curl:

```bash
# Start Postgres
docker compose -f deploy/docker-compose.yml up -d

# Start the server (in a separate terminal)
cd apps/server && go run ./cmd/watch

# Create a project and grab its key
curl -s -X POST http://localhost:8080/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test App"}' | jq .

# Copy the public_key from the response, then:
KEY="pk_<your_key_here>"

# 1. Valid event → 204
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/ingest/$KEY \
  -H 'Content-Type: application/json' \
  -d '{
    "environment":"production",
    "service":"frontend",
    "timestamp":"2026-06-17T10:00:00Z",
    "type":"web_vital",
    "context":{},
    "payload":{"name":"LCP","value":1200}
  }'
# Expect: 204

# Verify in DB:
psql "$DATABASE_URL" -c "SELECT id, event_type, received_at FROM raw_events LIMIT 5;"

# 2. Unknown key → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/ingest/pk_notreal \
  -H 'Content-Type: application/json' \
  -d '{"service":"frontend","timestamp":"2026-06-17T10:00:00Z","type":"web_vital","context":{},"payload":{}}'
# Expect: 401

# Check counter:
psql "$DATABASE_URL" -c "SELECT reason, day, count FROM dropped_event_counters;"

# 3. Malformed envelope → 400
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/ingest/$KEY \
  -H 'Content-Type: application/json' \
  -d '{"service":"frontend","timestamp":"not-a-date","type":"web_vital","context":{},"payload":{}}'
# Expect: 400
```

## Common gotchas

- **`::event_type` cast fails** — if you pass a string not in the enum (`"webvital"` instead of `"web_vital"`), Postgres returns an error. The `validEventTypes` map guard in Go prevents this, but double-check the exact strings match the migration's `CREATE TYPE event_type AS ENUM (...)`.
- **NULL `environment_id` in counter** — the `NULLS NOT DISTINCT` index is a Postgres 15+ feature. If you're on an older Postgres, the upsert won't work correctly for unknown-key drops. The Docker Compose stack pins Postgres 17, so this is fine locally.
- **Body read after LimitReader** — `io.LimitReader` stops at `n` bytes. If you check `len(body) > maxIngestBodyBytes` and the limit is `maxIngestBodyBytes+1`, a body of exactly `maxIngestBodyBytes` reads all bytes and passes; a body of `maxIngestBodyBytes+1` reads exactly `maxIngestBodyBytes+1` bytes and fails. Off-by-one errors here cause silent data loss or false 413s.
- **`time.Parse(time.RFC3339, ...)` vs `time.RFC3339Nano`** — RFC3339 handles `2026-06-17T10:00:00Z` but not `2026-06-17T10:00:00.123Z`. If the SDK sends sub-second precision, use `time.RFC3339Nano` or parse with both formats.

## What this task does NOT do

- **Rate limiting** — the `rate_limited` counter reason exists in the schema but the actual limit is not enforced yet.
- **Schema validation per event type** — M1 validates the envelope (type, service, timestamp) but does not deep-validate the `payload` field against a per-type schema. That arrives with the full event taxonomy in a later task.
