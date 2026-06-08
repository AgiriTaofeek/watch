# Task 5 — Foundational Schema

The first real migration. We write `0001_foundational_tables.up.sql` (and its `.down.sql`) creating the seven tables every other M1 feature reads and writes. On the next startup, the migration runner from Task 4 applies it and `migrations applied` jumps from `0` to `1`.

For the broader milestone context, see [README.md](README.md) — especially [§4 The Data Model](README.md#4-the-data-model). For the runner that executes this file, see [task-4-migration-tooling.md](task-4-migration-tooling.md). For schema conventions, see [docs/data-modeling-framework.md](../data-modeling-framework.md).

## Goal

> The first migration creating all 7 foundational tables.
>
> After watch startup, `psql -c "\dt"` lists `organizations`, `users`, `projects`, `environments`, `ingestion_keys`, `raw_events`, `dropped_event_counters` (plus `schema_migrations` from golang-migrate).

This task is **pure SQL** — two files, no Go. Task 4 already built the machine that runs them.

## Why this task exists

[README §4](README.md#4-the-data-model) describes the seven tables conceptually; this task turns that description into the actual schema. Everything downstream depends on it: project CRUD (Task 7) writes `projects`/`environments`/`ingestion_keys`; ingestion (Task 8) writes `raw_events` and `dropped_event_counters`; auth (Task 9) writes `users`. Nothing can be built until the tables exist.

Because migrations run on startup (Task 4), the moment this file lands, every environment — your laptop, CI, a teammate's machine, production — converges on the same schema automatically.

## Concept primer

- **DDL** — *Data Definition Language*: the `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` statements that define structure (as opposed to DML — `INSERT`/`SELECT`/`UPDATE` — that moves data around).
- **`uuid` primary keys + `gen_random_uuid()`** — we identify rows with random UUIDs rather than auto-incrementing integers. They don't leak row counts or allow enumeration (`/projects/1`, `/projects/2`…), which suits a privacy-first product, and they serialize as the opaque string ids the API already uses. `gen_random_uuid()` is built into Postgres core (13+), so no extension is needed on our Postgres 17.
- **`timestamptz`** — *timestamp with time zone*: always store instants in UTC with zone awareness. `DEFAULT now()` stamps row creation.
- **Foreign key + `ON DELETE CASCADE`** — a child column whose value must match a parent's primary key. `CASCADE` means deleting a parent removes its children (delete a project → its environments, keys, and events go too). Keeps the database from accumulating orphans.
- **Enum type** — a column restricted to a fixed set of string values (`role`, `event_type`, `reason`). We use native Postgres `CREATE TYPE ... AS ENUM`, which is self-documenting and rejects typos at write time. (Postgres 12+ can `ALTER TYPE ... ADD VALUE` inside a migration's transaction, so the set can grow later.)
- **`jsonb`** — Postgres's binary JSON type. `raw_events.payload` stores the full event envelope verbatim; `jsonb` lets us query *inside* it later (M5 rollups) while keeping it opaque for now.
- **Denormalization** — copying `environment_id` and `project_id` onto `raw_events` even though they're reachable via `ingestion_key_id`. Raw events are queried constantly; the copies avoid joins on the hottest table. ([README §4 raw_events](README.md#raw_events) explains the tradeoff.)
- **`UNIQUE` constraint vs index** — a `UNIQUE` constraint *creates* a backing index, so a unique column is also fast to look up; no separate `CREATE INDEX` needed for it.
- **`NULLS NOT DISTINCT`** — by default Postgres treats `NULL`s as distinct in a unique index, so multiple rows with a `NULL` column slip past uniqueness. `dropped_event_counters.environment_id` is nullable (an unknown key has no environment), and we rely on a unique `(environment_id, reason, day)` for the upsert — so we need `NULLS NOT DISTINCT` (Postgres 15+) to make two `NULL`-environment rows collide. Without it, the `ON CONFLICT` upsert in Task 8 would silently insert duplicates.
- **Up / down migration** — `*.up.sql` applies the change; `*.down.sql` reverses it (for manual rollback in development). `watch` only runs `up` on startup.

## File 1 — `apps/server/internal/store/migrations/0001_foundational_tables.up.sql`

Create this file. The order matters: a table must exist before another table can reference it.

```sql
-- Enum types for the fixed-value columns.
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TYPE event_type AS ENUM (
    'web_vital',
    'frontend_error',
    'network_request',
    'navigation',
    'asset_load',
    'breadcrumb',
    'deployment'
);

CREATE TYPE drop_reason AS ENUM (
    'unknown_key',
    'revoked_key',
    'invalid_schema',
    'oversized_payload',
    'rate_limited',
    'blocked_origin'
);

-- The single organization per deployment (plumbing for future multi-org).
CREATE TABLE organizations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Humans who log into the dashboard.
CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email               text NOT NULL,
    password_hash       text,             -- Argon2id output; NULL until set (M1 fills it in Task 9)
    display_name        text,
    role                user_role NOT NULL,
    external_subject_id text,             -- reserved for future OIDC / trusted-header auth
    auth_provider       text,             -- reserved; see docs/auth-model.md
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_login_at       timestamptz,
    UNIQUE (organization_id, email)
);

-- One monitored frontend application.
CREATE TABLE projects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name            text NOT NULL,
    slug            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug)
);

-- A deployment target of a project (production, staging, ...).
CREATE TABLE environments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

-- The public key the SDK uses to authenticate ingestion.
CREATE TABLE ingestion_keys (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
    public_key     text NOT NULL UNIQUE,   -- UNIQUE creates the lookup index
    created_at     timestamptz NOT NULL DEFAULT now(),
    revoked_at     timestamptz             -- NULL while active; set on revoke
);

-- Every accepted event, stored verbatim. The bedrock table.
CREATE TABLE raw_events (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_key_id uuid NOT NULL REFERENCES ingestion_keys (id) ON DELETE CASCADE,
    environment_id   uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE,  -- denormalized
    project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,      -- denormalized
    event_type       event_type NOT NULL,
    release          text,
    event_timestamp  timestamptz NOT NULL,           -- when it happened on the client
    received_at      timestamptz NOT NULL DEFAULT now(),  -- when the server accepted it
    payload          jsonb NOT NULL
);

-- The hot query paths: "events for this project/environment, newest first".
CREATE INDEX idx_raw_events_project_received ON raw_events (project_id, received_at DESC);
CREATE INDEX idx_raw_events_environment_received ON raw_events (environment_id, received_at DESC);

-- Per-day counts of rejected events, grouped by reason.
CREATE TABLE dropped_event_counters (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id uuid REFERENCES environments (id) ON DELETE CASCADE,  -- NULL when the key was unknown
    reason         drop_reason NOT NULL,
    day            date NOT NULL,
    count          bigint NOT NULL DEFAULT 0
);

-- The target of Task 8's INSERT ... ON CONFLICT upsert. NULLS NOT DISTINCT
-- (Postgres 15+) makes rows with a NULL environment_id collide as expected.
CREATE UNIQUE INDEX idx_dropped_counters_unique
    ON dropped_event_counters (environment_id, reason, day) NULLS NOT DISTINCT;
```

### What each block does

**The three `CREATE TYPE` enums** define the fixed value sets up front so the tables below can use them as column types. `user_role`, `event_type` (the seven types from [docs/event-taxonomy.md](../event-taxonomy.md)), and `drop_reason` (the six rejection reasons from the [ingestion flow](README.md#ingestion-post-ingestkey)).

**`organizations`** — one row in v1. Exists so every other table can carry an `organization_id` and the schema never changes if multi-org arrives later.

**`users`** — `UNIQUE (organization_id, email)` makes email unique *within* an org. `password_hash` is nullable because it's filled in Task 9, and `external_subject_id`/`auth_provider` are reserved for future auth modes ([docs/auth-model.md](../auth-model.md)). `role` uses the `user_role` enum.

**`projects`** — `UNIQUE (organization_id, slug)` keeps slugs unique per org so `customer-portal` resolves unambiguously.

**`environments`** — `UNIQUE (project_id, name)` prevents two `production` environments under one project.

**`ingestion_keys`** — `public_key text NOT NULL UNIQUE`: the `UNIQUE` constraint both enforces no-collisions and provides the fast index the ingestion endpoint needs to resolve a key. `revoked_at` is the soft-revoke marker (we never delete keys, so historical events stay attributable).

**`raw_events`** — carries denormalized `environment_id` and `project_id` so the most-queried table avoids joins. `payload jsonb` holds the whole envelope. The two indexes back the common "latest events for a project/environment" queries (`received_at DESC`).

**`dropped_event_counters`** — `environment_id` is nullable (an unknown key can't be resolved to an environment). The unique index on `(environment_id, reason, day)` with `NULLS NOT DISTINCT` is what lets Task 8 do `INSERT ... ON CONFLICT (environment_id, reason, day) DO UPDATE SET count = count + 1` atomically — including for the NULL-environment case.

## File 2 — `apps/server/internal/store/migrations/0001_foundational_tables.down.sql`

The reverse, in dependency order — drop children before parents, tables before the types they use:

```sql
DROP TABLE IF EXISTS dropped_event_counters;
DROP TABLE IF EXISTS raw_events;
DROP TABLE IF EXISTS ingestion_keys;
DROP TABLE IF EXISTS environments;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

DROP TYPE IF EXISTS drop_reason;
DROP TYPE IF EXISTS event_type;
DROP TYPE IF EXISTS user_role;
```

`watch` never runs this on startup — it's for manual rollback during development (`migrate down`, or just drop the dev database). Dropping in reverse order avoids "cannot drop … because other objects depend on it" errors.

> The `migrations/.keep` placeholder from Task 4 can stay or be removed now that real `.sql` files exist — `//go:embed all:migrations` is happy either way.

## Verification

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
```

This time the runner applies the new migration:

```json
{"time":"...","level":"INFO","msg":"Connected to Postgres"}
{"time":"...","level":"INFO","msg":"migrations applied","count":1}
{"time":"...","level":"INFO","msg":"watch starting", ...}
```

Confirm the tables exist:

```bash
psql "$DATABASE_URL" -c "\dt"
# organizations, users, projects, environments, ingestion_keys,
# raw_events, dropped_event_counters, schema_migrations
```

Confirm the enums and an index landed:

```bash
psql "$DATABASE_URL" -c "\dT"     # drop_reason, event_type, user_role
psql "$DATABASE_URL" -c "\d raw_events"
```

Idempotency check — stop and start watch again; the migration is **not** re-applied:

```json
{"time":"...","level":"INFO","msg":"migrations applied","count":0}
```

Then the static checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All green.

## Lint, commit, push, PR

Branch off `main`:

```bash
git checkout main && git pull
git checkout -b feat/m1-foundational-schema
```

Stage your changes:

```bash
git add apps/server/internal/store/migrations/0001_foundational_tables.up.sql \
        apps/server/internal/store/migrations/0001_foundational_tables.down.sql \
        docs/milestone-1/task-5-foundational-schema.md
```

Commit and push. **Generate the commit message at commit time** from your staged diff following [AGENTS.md](../../AGENTS.md) conventions (`<type>: <imperative summary>` — ask Claude to draft it from `git diff --staged` if you like):

```bash
git commit                                    # write/paste the generated message
git push -u origin feat/m1-foundational-schema
```

Open the PR — the body auto-fills from [.github/pull_request_template.md](../../.github/pull_request_template.md). Fill its sections from the diff (or ask Claude to draft them); the PR title is your commit message.

## Common gotchas

### `migrations applied` shows 0, not 1

The file name must match golang-migrate's pattern exactly: `0001_foundational_tables.up.sql` (and `.down.sql`). A typo in the version prefix, a missing `.up`, or a wrong extension means the source driver ignores the file and nothing applies. Confirm both files sit in `apps/server/internal/store/migrations/`.

### `type "user_role" does not exist`

Order matters: the `CREATE TYPE` statements must come *before* the tables that use them, in the same file. Postgres executes top-to-bottom.

### `Dirty database version 1. Fix and force version.`

A statement in the migration failed midway, leaving `schema_migrations` marked dirty. Fix the SQL, then either drop the dev database (`docker compose ... down -v && up -d`) and re-run, or `migrate force 0` and re-apply. Because the whole file runs in one transaction, a fresh DB is usually the fastest reset in dev.

### `NULLS NOT DISTINCT` syntax error

That clause needs Postgres 15+. The Compose stack pins `postgres:17`, so it works. If you point `DATABASE_URL` at an older Postgres, it won't.

### `updated_at` never changes

`DEFAULT now()` only sets it on insert. Keeping `updated_at` current on updates is the application's job (or a future trigger) — not done in this migration.

## What this task does NOT do

- **No seed data.** No default organization, user, or project rows. The first owner is created via `POST /auth/setup` in Task 9.
- **No queries.** Go code that reads/writes these tables arrives in Tasks 7–9.
- **No `updated_at` triggers.** See the gotcha above.
- **No retention/cleanup.** `raw_events` grows unbounded for now; retention (default 14 days, [docs/storage-retention.md](../storage-retention.md)) is a later concern.

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-foundational-schema
```

Next up: **Task 6 — `feat/m1-health-endpoint`**. We start the `http.Server` and add `GET /health`, which reports database connectivity — `200 {"status":"ok","db":"reachable"}` when Postgres is up, `503 {"status":"degraded",...}` when it's not — with graceful shutdown that drains in-flight requests.

The Task 6 walkthrough will land at `docs/milestone-1/task-6-health-endpoint.md` in that PR.
