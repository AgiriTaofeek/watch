# Task 1 — Docker Compose with Postgres

The first deliverable of Milestone 1. Stands up a local Postgres database via Docker Compose so subsequent tasks (Go config, connection pool, migrations, HTTP server) have a real database to talk to.

For the broader milestone context, see [README.md](README.md) — the Milestone 1 reference doc. For the conceptual basis of Docker / Compose / volumes, this doc has a primer below.

## Goal

> `docker compose -f deploy/docker-compose.yml up -d` brings Postgres up, `psql` can connect from the host, data persists across `down`/`up` cycles via a named volume.

That's the entire success criterion. No Go code, no migrations, no HTTP server. Just a running, healthy, persistent Postgres.

## Why this task exists

Every subsequent M1 task needs a Postgres to connect to. Rather than installing Postgres directly on the host (different on every machine, hard to reset, version drift between contributors), we run it in a container. The Compose file is the recipe — anyone who clones the repo can stand up an identical Postgres with one command.

## Concept primer

The vocabulary needed to read `docker-compose.yml`:

- **Docker** — a tool that runs software in isolated boxes called **containers**. You ask Docker to start a container from a pre-built image; it runs the program inside; when the program exits, the container stops. Your host machine stays clean — no Postgres installed locally, no system packages added.
- **Image** — a pre-built snapshot of software. `postgres:17-alpine` is the official Postgres 17 install snapshotted on top of a tiny Linux base called Alpine. Docker pulls the image once from a registry and caches it; subsequent container starts are instant.
- **Container** — a running instance of an image. By default, anything written inside a container is **gone** when the container stops. To persist data, you mount a **volume**.
- **Compose** — a tool that reads a YAML file describing a multi-container stack and brings everything up with `docker compose up`. The file is the source of truth for what runs.
- **Service** — one piece of the stack, defined as one entry under `services:`. Each service runs as one container. M1 has exactly one service: `postgres`.
- **Named volume** — a chunk of disk that survives container restarts. Without a volume, Postgres data dies every time the container stops. With a named volume, Postgres writes to `/var/lib/postgresql/data` inside the container, and Docker transparently maps that path to a persistent location on the host disk (specifically `/var/lib/docker/volumes/<volume-name>` on Linux, or the equivalent inside the Docker Desktop VM on macOS).
- **Port mapping** — `"5432:5432"` reads as "host port 5432 → container port 5432". The container's Postgres listens on 5432 inside the container; Compose exposes it on 5432 outside, so `psql` on the host can reach it at `localhost:5432`.
- **Healthcheck** — a command Docker runs periodically against the container to verify the service is actually ready (Postgres can be "started" but still booting). Other services can `depends_on` a healthy state, so they don't try to connect before Postgres is ready to accept connections.

That's the whole vocabulary. The file we're about to write is just YAML expressing those concepts.

## File 1 — `deploy/docker-compose.yml`

The full file:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: watch-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-watch}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-watch}
      POSTGRES_DB: ${POSTGRES_DB:-watch}
    ports:
      - "5432:5432"
    volumes:
      - watch_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-watch} -d ${POSTGRES_DB:-watch}"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 5s

volumes:
  watch_postgres_data:
    name: watch_postgres_data
```

### What each block does

**`services:`** — top-level key. Everything under it is a container Compose should run when you `docker compose up`.

**`postgres:`** — the name of one service. From inside the Compose-managed network, other containers can reach this one by the hostname `postgres`. The name is ours to pick.

**`image: postgres:17-alpine`** — use the official Postgres image, version 17, Alpine variant. Alpine is a tiny Linux base (~5 MB vs Debian's ~80 MB). For Postgres the Alpine flavour is well-supported, smaller to pull, and starts faster.

**`container_name: watch-postgres`** — without this, Docker auto-generates a name like `watch_postgres_1`. Pinning the name makes `docker ps` output predictable and lets us write commands like `docker exec watch-postgres ...` reliably across machines.

**`restart: unless-stopped`** — if the container crashes (or the host reboots), Docker restarts it automatically. The exception: if you ran `docker compose down` explicitly, Docker remembers you stopped it on purpose and won't restart on its own.

**`environment:`** — environment variables passed into the container. Postgres reads these on its **first boot** to set up the admin user, password, and initial database.

- `POSTGRES_USER: ${POSTGRES_USER:-watch}` — the syntax `${X:-default}` reads "use env var X from the shell (or `.env`) if set, otherwise use `watch`". Defaults to `watch` so the file works even without an `.env`.
- `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-watch}` — same pattern.
- `POSTGRES_DB: ${POSTGRES_DB:-watch}` — same. Defaults to a database called `watch`.

> **Important note about first-boot:** these env vars only run when the named volume is empty. If you change `POSTGRES_PASSWORD` later, the existing database keeps the old password. To pick up new values you have to wipe the volume: `docker compose down -v` then `up -d`. This is a Postgres image behaviour, not a Compose limitation.

**`ports:`** — host-to-container port mapping. `"5432:5432"` is `host:container`. The container's Postgres listens on 5432 inside; Compose maps that to 5432 on your host so `psql` on the host can dial `localhost:5432`. If port 5432 is already in use on your machine (e.g. you have a system-level Postgres), change the host side: `"5433:5432"` and use `localhost:5433` from outside.

**`volumes:` (service level)** — what to mount into the container.

- `watch_postgres_data:/var/lib/postgresql/data` — left of the colon is the volume name (declared at the bottom of the file). Right is the path inside the container where Postgres writes its data files. Docker maps the two; everything Postgres writes survives container destruction.

**`healthcheck:`** — how Docker decides whether the service is ready.

- `test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-watch} -d ${POSTGRES_DB:-watch}"]` — `pg_isready` is a Postgres-bundled CLI that exits 0 if the server is accepting connections, non-zero otherwise. `CMD-SHELL` means "run this string through a shell" (which is needed for the `${...}` substitution).
- `interval: 5s` — check every 5 seconds.
- `timeout: 3s` — each check must finish within 3 seconds.
- `retries: 10` — must fail 10 times in a row before being marked `unhealthy`.
- `start_period: 5s` — give the container 5 seconds after start before counting failures (Postgres boot takes a few seconds; checks during that window aren't held against the count).

**`volumes:` (top level)** — declares the named volume. Compose v2 requires every named volume referenced by a service to be declared here.

- `name: watch_postgres_data` — without this, Compose prefixes volume names with the project name (you'd end up with `watch_watch_postgres_data`). Setting `name:` explicitly pins it. Cleaner.

## File 2 — `.env.example` additions

Add three lines at the top of `.env.example`, above the existing `DATABASE_URL`:

```dotenv
# Postgres credentials consumed by deploy/docker-compose.yml
POSTGRES_USER=watch
POSTGRES_PASSWORD=watch
POSTGRES_DB=watch
```

The full Postgres-related block in `.env.example` becomes:

```dotenv
# Postgres credentials consumed by deploy/docker-compose.yml
POSTGRES_USER=watch
POSTGRES_PASSWORD=watch
POSTGRES_DB=watch

# Postgres connection string used by apps/server
DATABASE_URL=postgres://watch:watch@localhost:5432/watch?sslmode=disable
```

### Why three vars when `DATABASE_URL` already has the same values?

Two consumers read different things from `.env`:

- **Compose** reads `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` to configure how **Postgres itself** boots (via the `environment:` block above).
- **The Go server** (added in Task 2) will read `DATABASE_URL` to know how to **connect** to that already-running Postgres.

The two sources have to agree. If you change `POSTGRES_PASSWORD`, you also change the password inside `DATABASE_URL`. Two places, same truth. Standard for any project using Postgres in containers. Some teams write a small helper to build `DATABASE_URL` from the parts; for v1 we accept the duplication.

### Why not commit `.env`?

`.env` contains values your laptop uses. `.env.example` is the **template** committed to git. Every contributor copies `.env.example` to `.env` on first setup; `.env` itself is gitignored (look at `.gitignore` — `.env` and `.env.*` are excluded, `!.env.example` allows the example back in).

## Verification

After writing both files, run these from the repo root:

```bash
# Copy the example to a real .env (gitignored, stays local).
cp .env.example .env

# Bring the stack up in the background.
docker compose -f deploy/docker-compose.yml up -d
```

Expected output:

```
[+] Running 3/3
 ✔ Network watch_default          Created
 ✔ Volume "watch_postgres_data"   Created
 ✔ Container watch-postgres       Started
```

Check status:

```bash
docker compose -f deploy/docker-compose.yml ps
```

`watch-postgres` should show as `running` with status `(healthy)` within ~10 seconds. If it's still `(starting)`, wait 5 more seconds and try again.

Connect from the host. Compose reads `.env` automatically, but your interactive shell does **not** — `$DATABASE_URL` is empty in a fresh terminal until you load it. Two options:

**Option A — load `.env` into the shell once per session:**

```bash
set -a; source .env; set +a
psql "$DATABASE_URL"
```

`set -a` marks every variable defined after it as auto-exported; `source .env` reads each `KEY=value` line; `set +a` restores the default. After this, `$DATABASE_URL` is available to every command in this terminal.

**Option B — pass the URL inline (no env dance):**

```bash
psql "postgres://watch:watch@localhost:5432/watch?sslmode=disable"
```

Same effect. Pick whichever feels less ceremonial.

You should land at a `watch=#` prompt. Run a smoke test:

```sql
CREATE TABLE smoke (x int);
INSERT INTO smoke VALUES (1);
SELECT * FROM smoke;
\q
```

The `SELECT` returns one row with value `1`. `\q` exits psql.

Now prove the volume persists:

```bash
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml up -d
psql "$DATABASE_URL" -c "SELECT * FROM smoke;"
```

Same row returned. Data survived a full container destruction because the volume sat on host disk untouched.

Clean up the smoke table:

```bash
psql "$DATABASE_URL" -c "DROP TABLE smoke;"
```

## Lint, commit, PR

From the repo root, run the standard local checks (none should fail — this task doesn't touch code Biome, golangci-lint, tsc, or go test know about):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All green. Commit:

```bash
git add deploy/docker-compose.yml .env.example docs/milestone-1/task-1-compose-postgres.md
git commit -m "feat: add docker compose with postgres for local dev"
git push -u origin feat/m1-compose-postgres
```

Open the PR with the title above. Body:

```markdown
## What does this change and why?

First task of Milestone 1. Stands up Postgres 17 locally via Docker
Compose so the next M1 tasks (config loader, connection pool,
migrations, HTTP server) have a real database to talk to.

See [docs/milestone-1/README.md §8 Task 1](docs/milestone-1/README.md#task-1--featm1-compose-postgres)
for the task spec, and the new walkthrough at
[docs/milestone-1/task-1-compose-postgres.md](docs/milestone-1/task-1-compose-postgres.md)
for the per-line explanation of what landed.

Nothing in `apps/server/` is touched — Go code starts in Task 2.

## How to verify

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps          # postgres should be (healthy)
psql "$DATABASE_URL" -c "SELECT version();"             # returns a Postgres 17 version string
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml up -d
psql "$DATABASE_URL" -c "SELECT 1;"                     # still works; volume persisted
```

## Checklist

- [x] `pnpm lint` passes locally
- [x] `pnpm typecheck` passes locally
- [x] `pnpm test` passes locally
- [x] `pnpm build` succeeds locally
- [ ] Added a changeset — **N/A**, no publishable-package changes
- [x] Updated relevant docs — Task 1 walkthrough added at `docs/milestone-1/task-1-compose-postgres.md`
- [ ] Screenshots — **N/A**
```

## Common gotchas

### `docker: command not found` or `Cannot connect to the Docker daemon`

Docker isn't installed or isn't running. On macOS, install Docker Desktop from <https://www.docker.com/products/docker-desktop/> and open it (it adds the `docker` CLI to PATH and runs a tiny Linux VM that hosts the daemon). On Linux, install via your package manager and start the daemon (`sudo systemctl start docker`).

### `Bind for 0.0.0.0:5432 failed: port is already allocated`

Something else is using port 5432 — probably a system-level Postgres install. Two fixes:

1. Stop the local Postgres: `brew services stop postgresql@17` (macOS) or `sudo systemctl stop postgresql` (Linux).
2. Or change the host port in `docker-compose.yml`: `"5433:5432"` and update `DATABASE_URL` to use `localhost:5433`.

### `psql: command not found`

Install the Postgres client on the host (not the server — just the CLI). On macOS: `brew install postgresql@17`. On Ubuntu: `sudo apt install postgresql-client-17`. You don't need the full Postgres install; the client package is enough.

### Container status stuck at `(starting)` forever

Check logs: `docker compose -f deploy/docker-compose.yml logs postgres`. Common causes:

- The data volume has old state from a previous Postgres major version. Nuke and retry: `docker compose down -v` then `up -d`. The `-v` flag deletes named volumes.
- A typo in the `healthcheck.test` line. The test runs in a shell; if it never returns 0, the container never goes healthy.

### `psql: error: connection to server on socket ... failed: No such file or directory`

`psql` is trying the default Unix socket rather than TCP. Make sure you're passing the connection string explicitly: `psql "$DATABASE_URL"`. The `postgres://...` scheme forces TCP.

### Forgot the `-f deploy/docker-compose.yml` flag

Compose defaults to `./docker-compose.yml` in the current directory. Ours lives in `deploy/`. Without `-f`, Compose says "no compose file found" or runs the wrong one. Either always pass `-f deploy/docker-compose.yml`, or alias it (e.g. `alias dc='docker compose -f deploy/docker-compose.yml'`).

## What this task does NOT do

Explicit boundaries — these all belong to later tasks:

- **No Go code.** `apps/server/` is untouched. Task 2 (`feat/m1-config-loader`) starts the Go work.
- **No migrations.** The database is empty after `up`. Tables get created in Task 5 (`feat/m1-foundational-schema`) once the migration tooling is wired up in Task 4.
- **No connection from the Go server.** That's Task 3 (`feat/m1-postgres-pool`).
- **No HTTP endpoints.** That's Task 6 (`feat/m1-health-endpoint`).
- **No auth.** That's Task 9 (`feat/m1-auth`).
- **No production deploy story.** The Compose file is for **local dev only**. Production deployment is M5+ territory and will involve managed Postgres rather than running it in a container.

If you're tempted to "just add a little of the next thing" while you're here, resist. Each task gets its own PR for a reason — focused review, focused rollback, focused learning.

## After this PR merges

Sync your local main and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-compose-postgres
```

Next up: **Task 2 — `feat/m1-config-loader`**. We start the Go work by writing the env-var loader that reads `DATABASE_URL`, `WATCH_LISTEN_ADDR`, and `WATCH_LOG_LEVEL` into a typed `Config` struct. No Postgres connection yet — just loading and validating env at boot.

The Task 2 walkthrough will land at `docs/milestone-1/task-2-config-loader.md` in that PR.
