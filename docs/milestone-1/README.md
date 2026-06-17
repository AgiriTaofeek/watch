# Milestone 1: Ingestion Spine

A durable learning reference for the first milestone of Watch. This document explains *what each piece of M1 is*, *why it exists*, and *how it fits together* — in plain language, written for someone who has not built a Go HTTP service before.

For the broader project context, see [docs/roadmap.md](../roadmap.md), [docs/architecture.md](../architecture.md), and [docs/prd.md](../prd.md). For the tooling that supports development, see [docs/monorepo-concepts.md](../monorepo-concepts.md).

## How To Read This Document

The doc is **durable reference**, not a tutorial. You should not follow it top-to-bottom and end up with a working server. Instead:

- When you're about to start a task (see [§8 Task Breakdown](#8-task-breakdown)), skim the relevant data model and concept sections so you understand *why* you're typing what you're typing.
- When you encounter a term you don't know, check [§2 Vocabulary](#2-vocabulary) first.
- When something surprises you in the code later ("why is it done this way?"), the answer probably lives in [§6 Concept Deep-Dives](#6-concept-deep-dives).

The doc updates as M1 evolves. Anything that turns out wrong gets fixed here, not just in the code.

## 2. Vocabulary

These are backend terms a frontend engineer hasn't necessarily met. If a word is familiar, skip it.

- **HTTP server** — a long-running program that listens for HTTP requests on a port and responds. Symmetric to the browser's HTTP *client* perspective: the browser sends, the server receives. In Go, `http.Server` from the standard library is what listens.
- **Connection pool** — a small set of long-lived database connections that the server reuses across requests. Opening a fresh Postgres connection per request would take ~50ms each time; pooling reduces that to under 1ms. We use `pgxpool.Pool` from the `pgx` library.
- **Schema** — the shape of the database. Which tables exist, what columns each table has, what types those columns are, what relationships connect them.
- **Migration** — a versioned SQL file that evolves the schema. The first migration creates tables; later migrations add columns, indexes, or new tables. Each migration is small, named with a number, and applied in order.
- **Primary key** — the column that uniquely identifies a row in a table. Usually `id`. Postgres enforces uniqueness.
- **Foreign key** — a column whose value must match a primary key in another table. Example: `projects.organization_id` must match an `organizations.id` somewhere.
- **Index** — a side-table that makes lookups by a particular column fast. Without an index, finding a row by `email` requires scanning every row in `users`. With one, it's near-instant.
- **Transaction** — a group of database writes that all succeed or all fail together. If the server crashes halfway, the database is unchanged. Wraps with `BEGIN ... COMMIT` (or `ROLLBACK` on error).
- **Idempotency** — a property of a write where doing it twice has the same effect as doing it once. Ingestion attempts to be idempotent so SDK retries don't double-count events.
- **Public key / DSN** — the project- and environment-scoped string the SDK puts in its config. It's safe to embed in frontend code. It identifies *which* project an event belongs to but does not authenticate a specific user. Watch calls it an **ingestion key** internally.
- **Session cookie** — a small piece of state the server sets on the browser via `Set-Cookie`. The browser sends it back on every subsequent request. The cookie's value is a random string that maps (server-side) to a logged-in user.
- **CSRF (Cross-Site Request Forgery)** — an attack where a malicious site causes a logged-in user's browser to fire a request to your site. The browser sends cookies automatically, so without a separate guard, the malicious request succeeds. The guard is a **CSRF token** the legitimate page knows but the malicious page doesn't.
- **Password hashing** — turning a password into a fixed-size scrambled string that cannot be reversed. The server stores only the hash. On login, it hashes the submitted password and compares hashes. **Argon2id** is the current best-in-class algorithm.
- **Role-based access control (RBAC)** — permissions assigned to a role rather than to individual users. Watch v1 has four roles: `owner` (deployment-wide control), `admin` (manage projects + users), `member` (read + write project content), `viewer` (read only).
- **204 No Content** — an HTTP response status meaning "I accepted your request and there's no response body to send back". Used for ingestion: the SDK doesn't need anything back, just an acknowledgment.

## 3. Mental Model: What Is M1?

M1 builds the **server side of the SDK → backend pipeline** plus the **minimum dashboard auth** needed for a human to create a project from a browser.

Concretely, M1 ships:

- A Go HTTP server that accepts events from browser SDKs.
- A Postgres database with the foundational tables that make ingestion possible.
- A user-account system so a human can log in, create a project, and mint an ingestion key for the SDK.

```
Browser SDK              Dashboard (future, M6)
    │                         │
    │ POST /ingest/<key>      │ POST /auth/login, /api/projects, ...
    ▼                         ▼
       Watch HTTP server (apps/server, the "watch" binary)
                       │
                       ▼
                  Postgres
              (deploy/docker-compose.yml runs it locally)
```

Two API surfaces live in `apps/server`:

- **Ingestion API** — public-facing. Authenticated by ingestion key only. Receives events; persists them as raw events.
- **Dashboard API** — authenticated by user session. Manages organizations, users, projects, environments, and ingestion keys.

They are different security boundaries even though they run in the same Go process. The ingestion key gives an SDK permission to *submit events* — it does **not** grant any access to the dashboard API. See [docs/auth-model.md](../auth-model.md) for the full security boundary discussion.

## 4. The Data Model

Seven foundational tables. Each gets a "why does this exist", a quick column gloss, and a sketch of how it relates to other tables. Detailed DDL lands in the first migration; this section is conceptual.

### `organizations`

**Why:** Watch v1 is single-organization per deployment (see [docs/architecture.md](architecture.md#overview)). The `organizations` table exists not because we have many, but because every other table needs an `organization_id` foreign key — and once we ever support multi-org, the schema doesn't change. It's plumbing for future flexibility.

**Columns (sketch):**
- `id` — primary key.
- `name` — human-readable label (e.g. "Acme Inc").
- `created_at`, `updated_at` — timestamps.

**Relationships:** parent of everything else. There will be exactly one row in v1.

### `users`

**Why:** humans who log into the dashboard. We need to know their identity, their password hash, and which role they hold.

**Columns:**
- `id` — primary key.
- `organization_id` — foreign key → `organizations.id`.
- `email` — unique within the org.
- `password_hash` — Argon2id output. Never plaintext.
- `display_name` — optional friendly name.
- `role` — enum: `owner` | `admin` | `member` | `viewer`.
- `created_at`, `last_login_at` — timestamps.

**Relationships:** belongs to an org. Has many `sessions` (added later).

The user model intentionally has fields like `external_subject_id` and `auth_provider` reserved for future OIDC / trusted-header auth ([docs/auth-model.md](../auth-model.md)). M1 only fills the password-related fields.

### `projects`

**Why:** a "project" represents one frontend application being monitored. The Customer Portal SPA is one project; the Marketing Site is another. Events arrive scoped to a project.

**Columns:**
- `id` — primary key.
- `organization_id` — foreign key → `organizations.id`.
- `name` — e.g. "Customer Portal".
- `slug` — URL-safe identifier, e.g. `customer-portal`.
- `created_at`, `updated_at`.

**Relationships:** belongs to an org. Has many `environments`. Has many `ingestion_keys` (through environments). Has many `raw_events` (through ingestion_keys).

### `environments`

**Why:** the same project usually runs in multiple environments — `production`, `staging`, `preview`. Each environment has its own ingestion key so that staging traffic doesn't contaminate production data.

**Columns:**
- `id` — primary key.
- `project_id` — foreign key → `projects.id`.
- `name` — e.g. `production`, `staging`.
- `created_at`.

**Relationships:** belongs to a project. Has many ingestion keys.

### `ingestion_keys`

**Why:** the public string the SDK uses to authenticate ingest. It identifies *which project and environment* the events belong to. We allow multiple keys per environment so we can rotate (mint a new key, point the SDK at it, revoke the old) without downtime.

**Columns:**
- `id` — primary key.
- `environment_id` — foreign key → `environments.id`.
- `public_key` — the random string embedded in SDK config. Indexed for fast lookup.
- `created_at` — when it was minted.
- `revoked_at` — null while active; set when revoked.

**Relationships:** belongs to an environment. The key is what the SDK puts in its DSN. See `pk_abc123` in [docs/how-watch-works.md](how-watch-works.md#2-create-a-project).

### `raw_events`

**Why:** the bedrock table. Every event accepted from any SDK is stored here verbatim. Rollups (M5) and issues (M5) are computed *from* raw events. Without raw events, we cannot debug, cannot recompute, cannot prove what we ingested.

**Columns:**
- `id` — primary key.
- `ingestion_key_id` — foreign key → `ingestion_keys.id`. Lets us find every event from a key, including revoked ones.
- `environment_id` — denormalized for fast filtering by environment.
- `project_id` — denormalized for fast filtering by project.
- `event_type` — `web_vital`, `frontend_error`, `network_request`, `navigation`, `asset_load`, `breadcrumb`, `deployment` (see [docs/event-taxonomy.md](../event-taxonomy.md)).
- `release` — optional release name from the event envelope.
- `event_timestamp` — when the event happened on the client.
- `received_at` — when the server accepted it.
- `payload` — `jsonb` column containing the full envelope. Postgres can query inside JSON later.

"Denormalized" means we copy values from parent tables into this one so queries don't need joins. Raw events get queried *constantly* (rollups, debugging), so it's worth the storage cost.

Retention is governed by [docs/storage-retention.md](../storage-retention.md). Default: 14 days.

### `dropped_event_counters`

**Why:** silent failures hide bugs. If an SDK starts sending malformed events, we need to *see* that — both for the operator (debug a broken deploy) and for the dashboard (a "dropped events" gauge). This table is a per-day count of rejected events grouped by reason.

**Columns:**
- `id` — primary key.
- `environment_id` — foreign key → `environments.id`. Null if the key was unknown (couldn't resolve an environment).
- `reason` — enum: `unknown_key`, `revoked_key`, `invalid_schema`, `oversized_payload`, `rate_limited`, `blocked_origin`.
- `day` — date bucket (UTC).
- `count` — how many dropped events that day with that reason.

**Relationships:** optionally belongs to an environment. Aggregated by `(environment_id, reason, day)` — there's a unique index on those three columns and counts are incremented with an `INSERT ... ON CONFLICT (...) DO UPDATE SET count = count + 1`.

## 5. Request/Response Flows

End-to-end traces for the two API surfaces M1 ships. These are the load-bearing flows the rest of M1's code makes possible.

### Ingestion: `POST /ingest/<key>`

This is the SDK → server pipeline. Trusted only at the project+environment level (anyone with the key can submit events to that environment).

```
1. SDK sends a POST with JSON body:
      {
        "environment": "production",
        "release": "customer-portal@2026.05.31",
        "service": "frontend",
        "timestamp": "2026-05-31T10:23:45.000Z",
        "type": "frontend_error",
        "context": { "route": "/dashboard", "session_id": "..." },
        "payload": { "name": "TypeError", "message": "...", ... }
      }

2. Server looks up the ingestion_key by `public_key`.
      - Not found       → increment counters(reason=unknown_key)        → 401
      - Found but revoked → increment counters(reason=revoked_key)      → 401

3. Server checks the request `Origin` header against the project's
   allowlist (a column we'll add to `projects` when needed).
      - Mismatch        → increment counters(reason=blocked_origin)     → 403

4. Server checks the body size.
      - > 100 KB        → increment counters(reason=oversized_payload)  → 413

5. Server validates the JSON against the schema for `type=frontend_error`.
      - Invalid         → increment counters(reason=invalid_schema)     → 400

6. Server applies server-side redaction (strip any cookies, tokens, or
   sensitive headers that snuck through). See docs/security-privacy.md.

7. Server inserts into raw_events. Returns 204 No Content.
```

The SDK does not expect a response body. It only cares about the status code.

### Dashboard auth: login → list projects → logout

The dashboard API requires an authenticated user session.

```
1. Browser sends POST /auth/login with { email, password }.

2. Server fetches the user by email. If not found, returns 401 with a
   deliberately vague message ("invalid email or password") — avoid
   confirming whether the email exists.

3. Server compares the submitted password against the stored Argon2id
   hash using a constant-time verify.
      - Mismatch → return 401 with the same vague message.

4. Server creates a row in `sessions`:
      { id: random_token, user_id, expires_at: now + 24h, csrf_token: random }

5. Server returns 200 with `Set-Cookie: watch_session=<id>; Secure;
   HttpOnly; SameSite=Lax; Path=/; Expires=...`. The CSRF token goes in
   the response body so the dashboard JS can stash it and send it back
   in an `X-CSRF-Token` header on mutating requests.

6. Browser sends GET /api/projects with the session cookie.

7. Server reads the cookie, looks up the session, fetches the user,
   checks the user's role, queries projects, returns JSON.

8. Browser sends POST /api/projects with cookie + X-CSRF-Token header.

9. Server validates the cookie AND the CSRF token (must match the
   session's stored csrf_token). Without both, return 403.

10. Browser sends POST /auth/logout.

11. Server deletes the session row. Returns Set-Cookie with an expired
    cookie so the browser clears it.
```

Sessions and CSRF tokens are stored server-side. We can revoke a session by deleting the row — instant logout from every device.

## 6. Concept Deep-Dives

### Why migrations

**The problem:** code is reproduced from git. Every clone of the repo gets the same code. Databases are not. If you create a table by typing `CREATE TABLE` in psql on your laptop, your laptop has a table that no other contributor has. Production has different state. Staging has different state.

**The fix:** a **migration** is a SQL file checked into the repo with a numeric prefix. The first migration creates tables. The second adds a column. The third adds an index. Every environment (your laptop, CI, staging, prod) runs the same migrations in the same order, so every environment ends up with the same schema.

**Concrete example:**
```
apps/server/internal/store/migrations/
  0001_foundational_tables.up.sql
  0001_foundational_tables.down.sql
  0002_add_origin_allowlist.up.sql
  0002_add_origin_allowlist.down.sql
```

The `up.sql` applies the migration. The `down.sql` reverses it. `golang-migrate` keeps a `schema_migrations` table in your Postgres that records which migrations have been applied, so re-running is safe (it skips already-applied migrations).

In Watch, migrations are **embedded into the watch binary** via `go:embed` and **run automatically on startup**. So `watch` always boots into a schema it knows how to use.

### Why Argon2id

**The problem:** if we store passwords as plaintext, a database leak immediately compromises every user's password. If we hash with a fast algorithm like MD5 or SHA-256, attackers with GPUs can compute billions of hashes per second and brute-force common passwords.

**The fix:** a *slow*, *memory-hard* password hash. Argon2id (winner of the 2015 Password Hashing Competition) deliberately uses ~64MB of RAM and ~100ms of CPU per hash. Brute-forcing it is economically infeasible.

**Concrete example:**
```
Stored:  $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
```

The parameters (memory `m`, iterations `t`, parallelism `p`) are encoded in the stored string. The salt prevents two users with the same password from having the same hash.

Why not bcrypt? bcrypt is fine, still widely used, still safe. Argon2id is the *current* best-in-class — explicitly memory-hard (bcrypt isn't), funded by ongoing research. We pick the modern default. If you've used `bcrypt` before, the API of `golang.org/x/crypto/argon2` will feel familiar.

### Why session cookies, not JWTs

**The problem:** the dashboard needs to remember "this browser is logged in as Jane". The browser must send that fact on every request.

**Two approaches:**

- **Session cookie**: random opaque token, server keeps state. To know who Jane is, the server looks up the token in a `sessions` table and reads `user_id`.
- **JWT (JSON Web Token)**: a signed token that contains the claims (`user_id`, `expires_at`, etc.) inside it. Server only verifies the signature; no database lookup needed.

JWTs are popular for stateless APIs (microservices, SSO). For Watch, session cookies are simpler and **revocable**: deleting a row instantly logs the user out from every device. JWTs cannot be revoked without an additional blocklist — at which point you have all the cost of sessions with none of the simplicity.

**Concrete example:**

```
Set-Cookie: watch_session=8f3a...e2b1; Secure; HttpOnly; SameSite=Lax;
            Path=/; Expires=Sun, 01 Jun 2026 10:23:45 GMT
```

- `Secure` — only sent over HTTPS.
- `HttpOnly` — JavaScript cannot read it. Prevents XSS-based session theft.
- `SameSite=Lax` — browser only sends it on same-site requests + top-level navigations. Defends against a class of CSRF; not a full replacement for the CSRF token.

### Why CSRF protection

**The problem:** the user is logged into Watch. They visit `evil.com`. `evil.com` has a hidden form that POSTs to `https://watch.company.com/api/projects/123/keys/revoke`. The user's browser dutifully includes the `watch_session` cookie. The server can't tell this request came from a malicious page.

**The fix:** require a **CSRF token** on every mutating request. The token is set when the session starts and known only to the legitimate Watch dashboard JS. `evil.com` can't read it (different origin → blocked by the Same-Origin Policy). Without the token, mutating requests return 403.

**Concrete example:**

```
# Login response body (token returned to dashboard JS):
{
  "user": { "id": "...", "email": "..." },
  "csrf_token": "a3f8...c2d1"
}

# Subsequent mutation:
POST /api/projects HTTP/1.1
Cookie: watch_session=8f3a...e2b1
X-CSRF-Token: a3f8...c2d1
Content-Type: application/json

{ "name": "Customer Portal" }
```

The server reads both. If the `X-CSRF-Token` header doesn't match the stored token for this session, return 403.

GET requests don't need CSRF protection because GETs should never mutate state.

### Why "raw events"

**The problem:** if we only stored aggregates (counts per route per hour), we could never answer "what was the actual error message on this one request?". Aggregation is lossy.

**The fix:** persist every accepted event verbatim. Rollups (M5) and issue grouping (M5) are *computed* from raw events. If we change the rollup formula, we recompute from raw. If a customer reports a missing event, we can grep raw.

The cost is storage — many events per session, many sessions per day. We mitigate with **retention** (default 14 days; see [docs/storage-retention.md](../storage-retention.md)) and **sampling** (rollups keep full counts; raw events can be sampled). For M1 we keep the simple "persist everything for 14 days" model.

### Why dropped-event counters

**The problem:** if an SDK starts sending malformed events, the operator should see *some* signal. With no counter, the events just disappear and the operator can't tell whether the system is healthy or quietly losing data.

**The fix:** every drop path increments a counter keyed by reason. The system-health endpoint and the dashboard's "system" screen surface these counters.

The counters are a `(environment_id, reason, day)` table with an `INSERT ... ON CONFLICT DO UPDATE` pattern — Postgres handles the race between concurrent increments atomically.

## 7. Mapping M1 Pieces To Code

Every M1 deliverable maps to a Go package or a deploy file. Use this table when reading code to know where a thing lives.

| M1 deliverable | Lives in |
| --- | --- |
| HTTP routing + handlers | `apps/server/internal/api` |
| Postgres connection pool | `apps/server/internal/store` |
| Migrations (SQL files + embed + run-on-startup) | `apps/server/internal/store/migrations` + `apps/server/internal/store/migrate.go` |
| Env config loading | `apps/server/internal/config` |
| Password hashing / sessions / CSRF | `apps/server/internal/auth` (new package, created in task 9) |
| Background workers | `apps/server/internal/worker` (empty stub until M5) |
| Alert delivery | `apps/server/internal/alerts` (empty stub until M7) |
| Entry point + wiring | `apps/server/cmd/watch/main.go` |
| Local dev stack (Postgres) | `deploy/docker-compose.yml` |
| CI of the Go service | `.github/workflows/ci.yml` (already in place) |

## 8. Task Breakdown

Nine tasks. Each is one PR, branched off `main` with the prefix `feat/`. The order matters: task N depends on tasks 1..N-1.

### Task 1 — `feat/m1-compose-postgres`

**Goal:** stand up Postgres locally via Docker Compose.

**Files:** `deploy/docker-compose.yml` (new), `.env.example` (add `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).

**Done when:** `docker compose -f deploy/docker-compose.yml up -d` brings Postgres up, `psql` can connect from the host, data persists across `down`/`up` cycles via a named volume.

### Task 2 — `feat/m1-config-loader`

**Goal:** read env vars into a typed Go config struct; fail fast on missing required vars.

**Files:** `apps/server/internal/config/config.go` (replace the `doc.go` placeholder).

**Done when:** `pnpm dev` logs the loaded config on startup. Removing `DATABASE_URL` from env causes watch to exit with a clear error.

### Task 3 — `feat/m1-postgres-pool`

**Goal:** establish a Postgres connection pool the server can reuse.

**Files:** `apps/server/internal/store/store.go` (replace `doc.go`); update `apps/server/cmd/watch/main.go` to construct the pool.

**Deps added:** `github.com/jackc/pgx/v5`, `github.com/jackc/pgx/v5/pgxpool`.

**Done when:** watch starts, logs "connected to Postgres", responds to Ctrl-C with a clean shutdown that closes the pool.

### Task 4 — `feat/m1-migration-tooling`

**Goal:** wire `golang-migrate` so migrations run automatically on startup. No actual migrations yet — just the plumbing.

**Files:** `apps/server/internal/store/migrate.go` (new); `apps/server/internal/store/migrations/.keep` (empty placeholder).

**Deps added:** `github.com/golang-migrate/migrate/v4`, `github.com/golang-migrate/migrate/v4/database/postgres`, `github.com/golang-migrate/migrate/v4/source/iofs`.

**Done when:** watch logs "migrations applied: 0" on startup. Proves the embed + driver + database driver wiring is correct.

### Task 5 — `feat/m1-foundational-schema`

**Goal:** the first migration creating all 7 foundational tables.

**Files:** `apps/server/internal/store/migrations/0001_foundational_tables.up.sql` (new); `apps/server/internal/store/migrations/0001_foundational_tables.down.sql` (new).

**Done when:** after watch startup, `psql -c "\dt"` lists `organizations`, `users`, `projects`, `environments`, `ingestion_keys`, `raw_events`, `dropped_event_counters` (plus `schema_migrations` from golang-migrate).

### Task 6 — `feat/m1-health-endpoint`

**Goal:** the server is reachable over HTTP and reports DB connectivity.

**Files:** `apps/server/internal/api/api.go` (replace `doc.go`); update `apps/server/cmd/watch/main.go` to start an `http.Server`.

**Done when:** `curl localhost:8080/health` returns `200` with `{"status":"ok","db":"reachable"}`. Stopping Postgres and re-curling returns `503` with `{"status":"degraded","db":"<error>"}`. Ctrl-C drains in-flight requests and shuts down cleanly.

### Task 7 — `feat/m1-project-keys-crud`

**Goal:** CRUD endpoints for projects + environments + ingestion keys, without auth (auth comes in task 9, explicitly noted in the PR body).

**Files:** `apps/server/internal/api/projects.go` (new); `apps/server/internal/store/projects.go` (new); helpers as needed.

**Endpoints:**
- `POST /api/projects` → create project (auto-creates a `production` environment + initial key).
- `GET /api/projects` → list projects with their environments + keys.
- `POST /api/projects/:id/environments` → add another environment.
- `POST /api/environments/:id/keys` → mint a new key.
- `DELETE /api/keys/:id` → revoke (sets `revoked_at`, doesn't delete the row).

**Done when:** curl can create a project, get its key, mint a second key, revoke the first, list projects and see the right state.

### Task 8 — `feat/m1-ingest-endpoint`

**Goal:** accept events from the SDK.

**Files:** `apps/server/internal/api/ingest.go` (new); `apps/server/internal/store/events.go` (new); `apps/server/internal/store/counters.go` (new).

**Endpoint:** `POST /ingest/:key`.

**Done when:**
- A valid key + valid envelope returns `204` and a row appears in `raw_events`.
- An unknown key returns `401` and `dropped_event_counters(reason='unknown_key')` increments.
- A revoked key returns `401` and counter for `revoked_key` increments.
- A malformed envelope returns `400` and counter for `invalid_schema` increments.
- An oversized payload (>100KB) returns `413` and counter for `oversized_payload` increments.

### Task 9 — `feat/m1-auth`

**Goal:** local user accounts with sessions, CSRF, and role checks. The biggest task; split into 9a + 9b if it grows.

**Files:** `apps/server/internal/auth/passwords.go` (Argon2id wrap), `apps/server/internal/auth/sessions.go` (session creation + lookup), `apps/server/internal/auth/csrf.go` (middleware), `apps/server/internal/auth/roles.go` (role gating), `apps/server/internal/api/auth.go` (login/logout/me handlers); migrations `0002_sessions.up.sql` / `.down.sql`.

**Endpoints:**
- `POST /auth/setup` — only callable when zero users exist; creates the first owner.
- `POST /auth/login` → sets session cookie, returns user + CSRF token in body.
- `POST /auth/logout` → deletes session, clears cookie.
- `GET /me` → returns the current user from the session.

**Wire in:** middleware that checks session cookie on `/api/*` routes; middleware that checks CSRF token on mutating `/api/*` routes; per-route role gating where appropriate.

**Done when:** the full flow `POST /auth/setup` → `POST /auth/login` → `POST /api/projects` → `POST /api/environments/:id/keys` → `POST /auth/logout` works via `curl` with cookies persisted between requests. A second `POST /api/projects` without the CSRF header is rejected with 403.

After task 9, M1 is shippable. M2 (Browser SDK Core) can begin immediately because it now has a real ingestion endpoint to talk to.

## 9. What's Intentionally NOT In M1

Boundaries matter. These belong to later milestones — questions about them are not in scope while working on M1.

- **Event grouping into issues** (frontend errors → deterministic fingerprint → issue rows) — Milestone 5.
- **Web Vitals / network failure rollups** (minute/hour/day aggregates) — Milestone 5.
- **Frontend health score** computation — Milestone 5 (formula still TBD; see [docs/glossary.md](../glossary.md)).
- **Source map upload + stack trace resolution** — Milestone 8.
- **Alert rules + email / webhook delivery** — Milestone 7.
- **The dashboard UI itself** (TanStack Start app) — Milestone 6.
- **OIDC and trusted-header auth** for the dashboard — explicit non-goals of v1 ([docs/auth-model.md](../auth-model.md)).

The data model in M1 accommodates these — for example, `raw_events.event_type` covers every type that future rollups will consume — but the *logic* is deferred.

## 10. Further Reading

- Postgres docs: <https://www.postgresql.org/docs/current/>
- pgx (the Postgres driver): <https://github.com/jackc/pgx>
- golang-migrate: <https://github.com/golang-migrate/migrate>
- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- Argon2 RFC 9106: <https://datatracker.ietf.org/doc/html/rfc9106>
- Go `database/sql` overview: <https://go.dev/doc/tutorial/database-access>

Internal cross-references:

- [docs/architecture.md](../architecture.md) — the big-picture diagram of all services.
- [docs/auth-model.md](../auth-model.md) — the three auth concerns (dashboard, monitored-app identity, ingestion) and why they must stay separate.
- [docs/event-taxonomy.md](../event-taxonomy.md) — the seven event types and the shared envelope.
- [docs/security-privacy.md](../security-privacy.md) — the privacy posture and redaction model.
- [docs/storage-retention.md](../storage-retention.md) — table-level retention, raw vs rollups, sampling defaults.
- [docs/threat-model.md](../threat-model.md) — honest list of what Watch does *not* protect against.
- [docs/monorepo-concepts.md](../monorepo-concepts.md) — the surrounding tooling (pnpm, Turborepo, Biome, Husky, Changesets, branching, CI, releases).
- [docs/roadmap.md](../roadmap.md) — the full milestone list.
