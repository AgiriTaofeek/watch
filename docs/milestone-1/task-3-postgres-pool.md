# Task 3 — Postgres Connection Pool

The first third-party Go dependency lands. We add `pgx/v5`, write `apps/server/internal/store/store.go` to open a pooled connection to Postgres, and wire it into `cmd/watch/main.go` so watch connects on startup and fails fast if the database is unreachable.

For the broader milestone context, see [README.md](README.md). For Task 2's config loader (which gives us `cfg.DatabaseURL`), see [task-2-config-loader.md](task-2-config-loader.md).

## Goal

> Establish a Postgres connection pool the server can reuse.
>
> watch starts, logs "connected to Postgres", and responds to Ctrl-C with a clean shutdown that closes the pool.

No migrations, no schema, no HTTP server, no queries. Just: parse the URL → open a pool → prove connectivity → hand it back → close it on shutdown.

## Why this task exists

Every later M1 task needs to talk to Postgres: migrations (Task 4), the schema (Task 5), the health endpoint (Task 6), project CRUD (Task 7), ingestion (Task 8), auth (Task 9). They all need *a connection*. We establish that connection once, in one place, and let the rest of the codebase borrow it.

**Why a pool and not a single connection?** Opening a fresh Postgres connection costs ~50ms (TCP handshake, TLS, auth, session setup). If we opened one per request, a busy ingestion endpoint would spend most of its time connecting. A **connection pool** keeps a small set of connections open and hands them out as requests need them — reuse drops that cost to under 1ms. When a request finishes, its connection goes back to the pool instead of closing.

**Why centralise in `internal/store`?** The same reasoning as the config package: one package owns database access so the rest of the codebase never imports `pgx` directly. If we change drivers, tune the pool, or add query-level instrumentation later, it happens in one place. [README §7](README.md#7-mapping-m1-pieces-to-code) maps "Postgres connection pool" → `apps/server/internal/store`.

**Why fail fast at boot?** `pgxpool` is lazy — creating the pool doesn't actually connect. If we skipped the connectivity check, watch would boot "successfully" with a broken database config, and the failure would only surface on the first real request (or worse, in production at 3am). Instead we `Ping` once at startup: a wrong password or down database crashes watch immediately, with a clear log line, before it claims to be ready.

## Concept primer

The Go and pgx vocabulary you'll meet:

- **Connection pool** — a managed set of long-lived DB connections, reused across requests. We use `pgxpool.Pool` from the `pgx` library.
- **`pgx` / `pgxpool`** — `github.com/jackc/pgx/v5` is the de-facto Postgres driver for Go; `.../pgxpool` is its connection-pool layer. Pulling in `pgxpool` automatically pulls in `pgx/v5`.
- **`pgxpool.ParseConfig(url)`** — parses a connection string (`postgres://user:pass@host:port/db?sslmode=...`) into a `*pgxpool.Config` you can tweak (max connections, idle timeout) before opening the pool.
- **`pgxpool.NewWithConfig(ctx, cfg)`** — creates the pool from that config. **Lazy**: it validates the config but does not dial the database until a connection is first needed.
- **`pool.Ping(ctx)`** — borrows one connection and runs a trivial round-trip to the server. This is what forces a *real* connection so we can fail fast.
- **`context.Context`** — Go's standard way to carry deadlines and cancellation. `context.WithTimeout(parent, d)` returns a context that auto-cancels after `d`; passing it to `Ping` means "give up connecting after 10s instead of hanging forever".
- **`fmt.Errorf("doing X: %w", err)`** — wraps a lower-level error with context. The `%w` verb preserves the original error so callers can still inspect it with `errors.Is`/`errors.As`. Read the result top-down: `ping postgres: dial tcp ...: connection refused`.
- **`defer`** — schedules a call to run when the surrounding function returns. We `defer st.Close()` so the pool is released on shutdown no matter how `main` exits (normal path).
- **`go get` / `go mod tidy` / `go.sum`** — `go get <pkg>` adds a dependency to `go.mod`; `go mod tidy` prunes and squares up `go.mod` + writes `go.sum` (the checksums that pin exact dependency content). Both files are committed.

## Step 1 — add the dependency

From the server module directory:

```bash
cd apps/server
go get github.com/jackc/pgx/v5/pgxpool
go mod tidy
```

After this, `apps/server/go.mod` gains a `require` block listing `github.com/jackc/pgx/v5` (plus its transitive deps), and a new `apps/server/go.sum` appears with their checksums. This is the **first time `go.sum` exists** in the repo — commit it. (CI's `setup-go` step keys its build cache off the Go module files; a committed `go.sum` is exactly what it wants.)

## File 1 — `apps/server/internal/store/store.go`

Delete the placeholder `apps/server/internal/store/doc.go` (in your editor or `rm apps/server/internal/store/doc.go`) and create `store.go` in the same directory:

```go
// Package store owns the Postgres connection pool and all database access
// for watch. Every query in the server goes through this package; no other
// package imports pgx directly.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps a pgx connection pool. It is the single entry point for
// database access. Construct it with New; release it with Close.
type Store struct {
	pool *pgxpool.Pool
}

// New parses the connection string, opens a pooled connection to Postgres,
// and verifies connectivity with a Ping so we fail fast at boot. The caller
// owns the returned Store and must call Close when done.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	// Conservative defaults for a single-instance deployment; tune later.
	cfg.MaxConns = 10
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	// NewWithConfig is lazy — it doesn't dial until first use. Ping forces a
	// real connection now so a wrong URL / down DB fails startup, not request 1.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return &Store{pool: pool}, nil
}

// Pool exposes the underlying pgx pool for packages that run queries.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Close releases all pooled connections. Call once during shutdown.
func (s *Store) Close() { s.pool.Close() }
```

### What each block does

**The package comment** — same convention as `config`: completes the sentence "Package store ...". States the rule that all DB access funnels through here.

**Imports** — stdlib first (`context`, `fmt`, `time`), a blank line, then the third-party `pgxpool`. This is the first non-stdlib import in the server.

**`type Store struct { pool *pgxpool.Pool }`** — a thin wrapper around the pool. The field is **unexported** (lowercase `pool`) so nothing outside the package can grab the raw pool and bypass the abstraction; callers go through the methods. Wrapping (rather than exposing `*pgxpool.Pool` directly) gives us a place to hang future query methods like `store.CreateProject(...)`.

**`func New(ctx, databaseURL) (*Store, error)`** — the constructor. Returns a **pointer** (`*Store`) because a `Store` owns a live resource (the pool) and must be shared, not copied. The flow:
1. `ParseConfig` validates the URL shape. A malformed URL fails here, before any network call.
2. Set pool tunables. `MaxConns = 10` caps concurrent connections; `MaxConnIdleTime` closes connections idle for 5 minutes so we don't hold them forever. These are sane starting points, not final values.
3. `NewWithConfig` builds the pool (no dial yet).
4. `Ping` forces a real connection. On failure we `pool.Close()` to release whatever was half-allocated, then return a wrapped error. **Don't leak the pool on the error path.**

Every error is wrapped with `fmt.Errorf("...: %w", err)` so the caller's log line reads as a chain of causes.

**`func (s *Store) Pool() *pgxpool.Pool`** — an accessor for packages that actually run queries (Tasks 5+). Pointer receiver, returns the pool. For now nothing calls it, but it's the seam the rest of M1 plugs into.

**`func (s *Store) Close()`** — releases all connections. `pgxpool.Pool.Close()` is safe to call once; we call it from `main` via `defer`.

## File 2 — `apps/server/cmd/watch/main.go`

This is an edit, not a rewrite. After the signal context is set up (`ctx, stop := signal.NotifyContext(...)` / `defer stop()`) and **before** the `"watch starting"` log line, insert the connection step:

```go
	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	st, err := store.New(connectCtx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to Postgres", "error", err)
		os.Exit(1)
	}
	defer st.Close()

	logger.Info("connected to Postgres")
```

And add the two new imports — `time` (stdlib) and the local `store` package:

```go
import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/config"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)
```

The resulting `main` reads: load config → set up slog → set up signal context → **connect to Postgres** → log "watch starting" → block on `<-ctx.Done()` → log "watch shutting down" → return (deferred `st.Close()` and `stop()` run).

### What each block does

**`context.WithTimeout(ctx, 10*time.Second)`** — derives a child context from the signal context that also cancels after 10 seconds. Passing `connectCtx` to `store.New` (and thus to `Ping`) bounds startup: if Postgres is unreachable, watch errors out in 10s instead of hanging. `defer cancel()` releases the timer regardless of outcome — always pair `WithTimeout` with a deferred `cancel()`.

**The error branch** — on connect failure we log a structured `error` line (slog *is* set up by this point, unlike the earlier config-load failure) and `os.Exit(1)`. Note the caveat: `os.Exit` does **not** run deferred functions. That's acceptable here because the only defers registered so far (`stop`, `cancel`) guard resources the OS reclaims on exit anyway, and the pool wasn't successfully created.

**`defer st.Close()`** — on the **success** path, this is registered and runs when `main` returns normally (after `<-ctx.Done()` unblocks on Ctrl-C). That's the "clean shutdown that closes the pool" from the goal.

**`logger.Info("connected to Postgres")`** — the log line the goal asks for. It appears *before* `"watch starting"` so the boot sequence reads connect-then-announce.

## Verification

Load env into your shell (Compose reads `.env` for Postgres automatically; your shell needs it for watch):

```bash
set -a; source .env; set +a
echo "$DATABASE_URL"
# postgres://watch:watch@localhost:5432/watch?sslmode=disable
```

Make sure Postgres is up (from Task 1):

```bash
docker compose -f deploy/docker-compose.yml ps
# postgres ... (healthy)
```

Run watch:

```bash
pnpm --filter @watch/server dev
```

Expected log lines (order matters):

```json
{"time":"...","level":"INFO","msg":"connected to Postgres"}
{"time":"...","level":"INFO","msg":"watch starting","listen_addr":":8080","log_level":"info","database_url":"postgres://watch:***@localhost:5432/watch?sslmode=disable"}
```

Press Ctrl-C — clean shutdown:

```json
{"time":"...","level":"INFO","msg":"watch shutting down"}
```

Now prove fail-fast. Stop Postgres and re-run:

```bash
docker compose -f deploy/docker-compose.yml down
pnpm --filter @watch/server dev
```

Expected — an error line and a non-zero exit (no "watch starting"):

```json
{"time":"...","level":"ERROR","msg":"failed to connect to Postgres","error":"ping postgres: ... connection refused"}
```

Bring Postgres back for the rest of your work:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Finally, the static checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four green.

## Lint, commit, push, PR

Branch off `main`:

```bash
git checkout main && git pull
git checkout -b feat/m1-postgres-pool
```

Stage everything (note `go.mod` + the new `go.sum`):

```bash
git add apps/server/internal/store/store.go \
        apps/server/cmd/watch/main.go \
        apps/server/go.mod \
        apps/server/go.sum \
        docs/milestone-1/task-3-postgres-pool.md
git rm apps/server/internal/store/doc.go
```

Commit and push. **Generate the commit message at commit time** from your staged diff following [AGENTS.md](../../AGENTS.md) conventions (`<type>: <imperative summary>` — ask Claude to draft it from `git diff --staged` if you like):

```bash
git commit                                 # write/paste the generated message
git push -u origin feat/m1-postgres-pool
```

Open the PR — the body auto-fills from [.github/pull_request_template.md](../../.github/pull_request_template.md). Fill its sections from the diff (or ask Claude to draft them); the PR title is your commit message.

## Common gotchas

### `ping postgres: ... connection refused`

Postgres isn't running, or the URL points at the wrong host/port. Check `docker compose -f deploy/docker-compose.yml ps` shows `(healthy)` and that `DATABASE_URL` uses `localhost:5432`.

### `failed to connect ... SSL is not enabled on the server`

Local Postgres from Task 1's Compose doesn't speak TLS. Your `DATABASE_URL` must end with `?sslmode=disable` (it does in `.env.example`). Production with a real TLS-terminating Postgres would drop that.

### `imports github.com/.../store: not found` or `internal/store` won't import

The import path must exactly match `apps/server/go.mod`'s module line + the package directory:

```go
import "github.com/AgiriTaofeek/watch/apps/server/internal/store"
```

Also confirm you ran `go mod tidy` so `pgx` is actually in `go.mod`.

### CI fails on `go.sum` but it works locally

`go.sum` must be committed. If you `git add` the code but forget `go.sum`, CI's `go build`/`go vet` can't verify the new dependency and fails. Run `git status` and make sure `apps/server/go.sum` is staged.

### golangci-lint flags `Ping`'s error or an unchecked `Close`

`errcheck` wants every error handled. We handle `Ping`'s error; `pool.Close()` returns nothing, so it's fine to call bare. If you add a query later, check its error too.

## What this task does NOT do

- **No migrations.** Wiring `golang-migrate` to run schema changes on startup is Task 4 (`feat/m1-migration-tooling`).
- **No schema.** The 7 foundational tables arrive in Task 5's first migration. Right now the database is empty; we only prove we can reach it.
- **No HTTP server.** `ListenAddr` is still just a loaded string; the health endpoint that reports DB connectivity is Task 6.
- **No queries.** `Store.Pool()` exists but nothing calls it yet. The first real queries land in Task 5+.

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-postgres-pool
```

Next up: **Task 4 — `feat/m1-migration-tooling`**. We add `golang-migrate`, write `internal/store/migrate.go` to embed and run migrations on startup, and prove the plumbing with watch logging `"migrations applied: 0"` (no migrations exist yet — Task 5 writes the first one).

The Task 4 walkthrough will land at `docs/milestone-1/task-4-migration-tooling.md` in that PR.
