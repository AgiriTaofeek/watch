# Milestone 1 — Commit & PR Guide

The single source of truth for the **branch name**, **commit title**, and **PR description** of every Milestone 1 task. Because the repo squash-merges, a PR's **title becomes the one commit on `main`** — so the title rules below *are* the commit message rules. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the surrounding workflow and [README.md §8](README.md#8-task-breakdown) for the task specs.

## The rules

**Title** — `<type>: <imperative, lowercase summary>`
- `type` is one of `feat | fix | chore | docs | refactor | test`.
- Imperative mood ("add", not "adds"/"added"), lowercase, **no trailing period**, kept short.
- **Do not** add `(#123)` yourself — GitHub appends the PR number automatically on squash-merge.

**Branch** — `<type>/<scope>`, e.g. `feat/m1-postgres-pool`. Branch off an up-to-date `main`.

**Description** — fills the PR template ([.github/pull_request_template.md](../../.github/pull_request_template.md)):
- `## What does this change and why?` — one short paragraph; link the task spec and walkthrough.
- `## How to verify` — copy-pasteable commands a reviewer can run (from the task's "Done when").
- `## Checklist` — the four local checks, plus changeset / docs / screenshots lines.

**Changeset** — **N/A for all of M1.** Changesets are only for the publishable `@watch/browser` package; every M1 task lives in `apps/server`.

---

## Task 1 — `feat/m1-compose-postgres`

**Title**
```
feat: add docker compose with postgres for local dev
```

**Description**
```markdown
## What does this change and why?

First task of Milestone 1. Stands up Postgres 17 locally via Docker Compose
so the next M1 tasks (config loader, connection pool, migrations, HTTP
server) have a real database to talk to. Nothing in `apps/server/` is
touched — Go code starts in Task 2.

Spec: [README.md §8 Task 1](docs/milestone-1/README.md#task-1--featm1-compose-postgres).
Walkthrough: [docs/milestone-1/task-1-compose-postgres.md](docs/milestone-1/task-1-compose-postgres.md).

## How to verify

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps          # postgres should be (healthy)
psql "$DATABASE_URL" -c "SELECT version();"             # Postgres 17 version string
docker compose -f deploy/docker-compose.yml down && docker compose -f deploy/docker-compose.yml up -d
psql "$DATABASE_URL" -c "SELECT 1;"                     # still works; volume persisted
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 1 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 2 — `feat/m1-config-loader`

**Title**
```
feat: add config loader for watch
```

**Description**
```markdown
## What does this change and why?

Second task of Milestone 1. Adds the env-var config loader for the Go
service. After this, every M1 task loads configuration through
`internal/config.Load()` rather than calling `os.Getenv` directly.
`DATABASE_URL` is required; `WATCH_LISTEN_ADDR` and `WATCH_LOG_LEVEL`
have defaults; `Config.RedactedDatabaseURL()` masks the password in logs.

Spec: [README.md §8 Task 2](docs/milestone-1/README.md#task-2--featm1-config-loader).
Walkthrough: [docs/milestone-1/task-2-config-loader.md](docs/milestone-1/task-2-config-loader.md).

## How to verify

```bash
set -a; source .env; set +a
pnpm --filter @watch/server dev
# observe "watch starting" with a redacted database_url; Ctrl-C = clean shutdown

DATABASE_URL= pnpm --filter @watch/server dev
# expect: "watch configuration error: DATABASE_URL is required" on stderr, exit 1
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 2 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 3 — `feat/m1-postgres-pool`

**Title**
```
feat: add postgres connection pool
```

**Description**
```markdown
## What does this change and why?

Third task of Milestone 1. Adds the Postgres connection pool the rest of M1
builds on. `internal/store.New` opens a pooled connection via `pgx/v5` and
pings it so watch fails fast at boot if the database is unreachable;
`main.go` connects on startup and closes the pool on shutdown. First
third-party Go dependency (and first `go.sum`).

Spec: [README.md §8 Task 3](docs/milestone-1/README.md#task-3--featm1-postgres-pool).
Walkthrough: [docs/milestone-1/task-3-postgres-pool.md](docs/milestone-1/task-3-postgres-pool.md).

## How to verify

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
# expect "connected to Postgres" then "watch starting"; Ctrl-C = clean shutdown

docker compose -f deploy/docker-compose.yml down
pnpm --filter @watch/server dev
# expect "failed to connect to Postgres" + exit 1
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 3 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 4 — `feat/m1-migration-tooling`

**Title**
```
feat: run database migrations on startup
```

**Description**
```markdown
## What does this change and why?

Fourth task of Milestone 1. Wires `golang-migrate` so migrations run
automatically on startup, embedded into the watch binary via `go:embed`.
No migrations exist yet — this is the plumbing only (embed + source driver
+ database driver). Task 5 writes the first migration.

Spec: [README.md §8 Task 4](docs/milestone-1/README.md#task-4--featm1-migration-tooling).
Walkthrough: docs/milestone-1/task-4-migration-tooling.md.

## How to verify

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
# expect a startup log line: "migrations applied: 0"
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 4 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 5 — `feat/m1-foundational-schema`

**Title**
```
feat: add foundational database schema
```

**Description**
```markdown
## What does this change and why?

Fifth task of Milestone 1. Adds the first migration creating the seven
foundational tables: `organizations`, `users`, `projects`, `environments`,
`ingestion_keys`, `raw_events`, `dropped_event_counters`. These are the
bedrock the ingestion and dashboard APIs read and write.

Spec: [README.md §8 Task 5](docs/milestone-1/README.md#task-5--featm1-foundational-schema)
and [README.md §4 The Data Model](docs/milestone-1/README.md#4-the-data-model).
Walkthrough: docs/milestone-1/task-5-foundational-schema.md.

## How to verify

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev          # applies 0001_foundational_tables on startup
psql "$DATABASE_URL" -c "\dt"
# lists organizations, users, projects, environments, ingestion_keys,
# raw_events, dropped_event_counters (+ schema_migrations)
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 5 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 6 — `feat/m1-health-endpoint`

**Title**
```
feat: add health endpoint reporting db connectivity
```

**Description**
```markdown
## What does this change and why?

Sixth task of Milestone 1. Starts the `http.Server` and adds `GET /health`,
which reports database connectivity. This is the first reachable HTTP
surface and the basis for liveness/readiness checks in deployment.

Spec: [README.md §8 Task 6](docs/milestone-1/README.md#task-6--featm1-health-endpoint).
Walkthrough: docs/milestone-1/task-6-health-endpoint.md.

## How to verify

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev

curl -i localhost:8080/health
# 200 {"status":"ok","db":"reachable"}

docker compose -f deploy/docker-compose.yml stop postgres
curl -i localhost:8080/health
# 503 {"status":"degraded","db":"<error>"}
# Ctrl-C drains in-flight requests and shuts down cleanly
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 6 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 7 — `feat/m1-project-keys-crud`

**Title**
```
feat: add project, environment, and ingestion key endpoints
```

**Description**
```markdown
## What does this change and why?

Seventh task of Milestone 1. Adds CRUD for projects, environments, and
ingestion keys — the objects a human needs to onboard a frontend app.
**Auth is intentionally not wired yet** (it lands in Task 9); these
endpoints are open until then.

Endpoints: `POST /api/projects` (auto-creates a `production` environment +
initial key), `GET /api/projects`, `POST /api/projects/:id/environments`,
`POST /api/environments/:id/keys`, `DELETE /api/keys/:id` (revokes).

Spec: [README.md §8 Task 7](docs/milestone-1/README.md#task-7--featm1-project-keys-crud).
Walkthrough: docs/milestone-1/task-7-project-keys-crud.md.

## How to verify

```bash
# create a project (returns its production environment + first key)
curl -s -X POST localhost:8080/api/projects -d '{"name":"Customer Portal"}'
# mint a second key on that environment, revoke the first, then:
curl -s localhost:8080/api/projects        # shows projects with envs + keys in the expected state
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 7 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 8 — `feat/m1-ingest-endpoint`

**Title**
```
feat: add event ingestion endpoint
```

**Description**
```markdown
## What does this change and why?

Eighth task of Milestone 1. Adds `POST /ingest/:key` — the SDK → server
pipeline. Valid events are stored in `raw_events`; every rejection path
increments `dropped_event_counters` by reason so silent data loss is
visible. After this, M2 (Browser SDK) has a real endpoint to talk to.

Spec: [README.md §8 Task 8](docs/milestone-1/README.md#task-8--featm1-ingest-endpoint)
and the ingestion flow in [README.md §5](docs/milestone-1/README.md#5-requestresponse-flows).
Walkthrough: docs/milestone-1/task-8-ingest-endpoint.md.

## How to verify

```bash
# valid key + valid envelope → 204, and a row appears in raw_events
curl -i -X POST localhost:8080/ingest/<valid_key> -d @event.json   # 204

# drop paths each return their status AND bump the matching counter:
#   unknown key       → 401  (reason=unknown_key)
#   revoked key       → 401  (reason=revoked_key)
#   malformed body    → 400  (reason=invalid_schema)
#   body > 100KB      → 413  (reason=oversized_payload)
psql "$DATABASE_URL" -c "SELECT reason, count FROM dropped_event_counters;"
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 8 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Task 9 — `feat/m1-auth`

**Title**
```
feat: add local accounts with sessions and csrf
```

**Description**
```markdown
## What does this change and why?

Ninth and final task of Milestone 1. Adds local user accounts: Argon2id
password hashing, server-side sessions via secure cookies, CSRF protection
on mutating requests, and role gating (`owner`/`admin`/`member`/`viewer`).
Wires session middleware onto `/api/*` and CSRF middleware onto mutations.
After this, M1 is shippable.

Endpoints: `POST /auth/setup` (first owner, only when zero users exist),
`POST /auth/login`, `POST /auth/logout`, `GET /me`.

Spec: [README.md §8 Task 9](docs/milestone-1/README.md#task-9--featm1-auth)
and the auth flow in [README.md §5](docs/milestone-1/README.md#5-requestresponse-flows).
Walkthrough: docs/milestone-1/task-9-auth.md.

## How to verify

```bash
# full flow with cookies persisted between requests:
curl -sc cookies.txt -X POST localhost:8080/auth/setup -d '{"email":"a@b.com","password":"..."}'
curl -sc cookies.txt -X POST localhost:8080/auth/login -d '{"email":"a@b.com","password":"..."}'
#   -> returns user + csrf_token; send it as X-CSRF-Token on mutations
curl -sb cookies.txt -X POST localhost:8080/api/projects \
     -H "X-CSRF-Token: <token>" -d '{"name":"Customer Portal"}'      # 200
curl -sb cookies.txt -X POST localhost:8080/api/projects -d '{"name":"X"}'   # 403 (no CSRF header)
curl -sb cookies.txt -X POST localhost:8080/auth/logout
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 9 walkthrough
- [ ] Screenshots — **N/A**
```

---

## Quick reference

| # | Branch | Title |
|---|--------|-------|
| 1 | `feat/m1-compose-postgres` | `feat: add docker compose with postgres for local dev` |
| 2 | `feat/m1-config-loader` | `feat: add config loader for watch` |
| 3 | `feat/m1-postgres-pool` | `feat: add postgres connection pool` |
| 4 | `feat/m1-migration-tooling` | `feat: run database migrations on startup` |
| 5 | `feat/m1-foundational-schema` | `feat: add foundational database schema` |
| 6 | `feat/m1-health-endpoint` | `feat: add health endpoint reporting db connectivity` |
| 7 | `feat/m1-project-keys-crud` | `feat: add project, environment, and ingestion key endpoints` |
| 8 | `feat/m1-ingest-endpoint` | `feat: add event ingestion endpoint` |
| 9 | `feat/m1-auth` | `feat: add local accounts with sessions and csrf` |
