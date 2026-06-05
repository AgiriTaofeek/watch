# Task 4 — Migration Tooling

We wire [`golang-migrate`](https://github.com/golang-migrate/migrate) so the database schema evolves through versioned SQL files that run **automatically on startup**, embedded into the `watch` binary. This task is **plumbing only** — no tables yet. Proving the wiring means watch boots and logs `migrations applied: 0`.

For the broader milestone context, see [README.md](README.md). For Task 3's connection pool (which this builds on), see [task-3-postgres-pool.md](task-3-postgres-pool.md).

## Goal

> Wire `golang-migrate` so migrations run automatically on startup. No actual migrations yet — just the plumbing.
>
> watch logs `migrations applied: 0` on startup. Proves the embed + source driver + database driver wiring is correct.

The first real migration (the seven foundational tables) lands in Task 5. Here we only build the machine that *runs* migrations.

## Why this task exists

Code is reproduced from git — every clone gets the same code. **Databases are not.** If you create tables by typing `CREATE TABLE` into `psql` on your laptop, no other contributor (or CI, or production) has them. State drifts.

A **migration** fixes this: a numbered SQL file checked into the repo. The first creates tables; later ones add columns or indexes. Every environment runs the same files in the same order, so every environment ends up with the same schema. `golang-migrate` keeps a `schema_migrations` bookkeeping table in Postgres recording which files have run, so re-running is safe — already-applied migrations are skipped.

Two design choices Watch makes (see [README §6 "Why migrations"](README.md#why-migrations)):

- **Embedded into the binary** via `go:embed`. The migrations travel *with* the compiled `watch` binary — there's no separate "migrations folder" to ship or mount. The binary is self-sufficient.
- **Run on startup.** `watch` applies any pending migrations before it serves traffic, so it always boots into a schema it knows how to use. No manual "remember to run migrations" step.

## Concept primer

- **`golang-migrate`** — the de-facto migration runner for Go. It has *source* drivers (where migration files come from) and *database* drivers (what database to apply them to).
- **Source driver `iofs`** — reads migration files from an `fs.FS`. Combined with `go:embed`, the files come from inside the binary.
- **Database driver `database/postgres`** — applies migrations to Postgres. Imported for its **side effect** (a blank import `_ "..."`) which *registers* the `postgres://` URL scheme with `golang-migrate`.
- **`embed.FS` + `//go:embed`** — Go's compile-time file embedding. `//go:embed <pattern>` above a `var x embed.FS` bakes matching files into the binary.
- **`//go:embed all:migrations`** — the `all:` prefix embeds the `migrations` directory **including** files whose names start with `.` or `_` (which `go:embed` skips by default). We need this because the only file in `migrations/` right now is `.keep`.
- **`migrate.ErrNoChange`** — the sentinel `Up()` returns when there's nothing to apply. **Not an error** in our flow — it's the normal "already up to date" (or "no migrations exist yet") case.
- **`migrate.ErrNilVersion`** — what `Version()` returns when no migration has ever been applied. We treat it as version `0`.
- **Separate connection** — `golang-migrate` opens its **own** short-lived `database/sql` connection from the URL, runs migrations, and closes it. This is independent of the `pgxpool` from Task 3 (which serves requests). Migrations are a one-shot boot step; the pool is for the server's lifetime.

## Step 1 — add the dependency

From the server module:

```bash
cd apps/server
go get github.com/golang-migrate/migrate/v4
go mod tidy
```

`go mod tidy` pulls in the two driver subpackages (`database/postgres`, `source/iofs`) once `migrate.go` imports them, and updates `go.mod` + `go.sum`.

## File 1 — `apps/server/internal/store/migrate.go`

Create this new file alongside `store.go`:

```go
package store

import (
	"embed"
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres" // registers postgres:// driver
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// migrationsFS holds the SQL migrations compiled into the binary. The all:
// prefix embeds dotfiles too, so the .keep placeholder keeps this compiling
// before any real .sql files exist (Task 5 adds the first migration).
//
//go:embed all:migrations
var migrationsFS embed.FS

// RunMigrations applies every pending migration embedded in the binary and
// returns how many were applied this run. Safe to call on every startup:
// already-applied migrations are skipped. It uses its own short-lived
// connection (separate from the pgx pool) via the postgres:// URL.
func RunMigrations(databaseURL string) (int, error) {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return 0, fmt.Errorf("load embedded migrations: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, databaseURL)
	if err != nil {
		return 0, fmt.Errorf("init migrate: %w", err)
	}
	defer func() {
		// Close returns a source error and a database error; neither is
		// actionable at shutdown, so log rather than fail the run.
		if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
			slog.Warn("closing migrator", "source", srcErr, "database", dbErr)
		}
	}()

	before := schemaVersion(m)

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}

	after := schemaVersion(m)
	return int(after - before), nil
}

// schemaVersion returns the current migration version, or 0 if no migration
// has been applied yet. Relies on Watch's sequential 0001, 0002, ... naming
// so the version number doubles as a count of applied migrations.
func schemaVersion(m *migrate.Migrate) uint {
	v, _, err := m.Version()
	if err != nil { // includes migrate.ErrNilVersion ("no version yet")
		return 0
	}
	return v
}
```

### What each block does

**`package store`** — migration running is database access, so it lives in the same package as the pool. No other package imports `golang-migrate` directly.

**The blank import** `_ "github.com/golang-migrate/migrate/v4/database/postgres"` — we never call this package by name. Importing it runs its `init()`, which registers the `postgres://` scheme so `migrate.NewWithSourceInstance(..., databaseURL)` knows how to connect. Remove the import and you get `unknown driver postgres`.

**`//go:embed all:migrations`** — bakes the `migrations/` directory into the binary as `migrationsFS`. The `all:` prefix is load-bearing: without it, `go:embed` ignores `.keep` (a dotfile), the directory looks empty, and the build fails with `no matching files found`. (See gotchas.)

**`RunMigrations(databaseURL)`** — the one exported function:
1. `iofs.New(migrationsFS, "migrations")` builds a source driver reading from the embedded `migrations` subdirectory.
2. `migrate.NewWithSourceInstance("iofs", src, databaseURL)` pairs that source with a Postgres database resolved from the URL. `defer m.Close()` releases migrate's connection when we're done.
3. `before := schemaVersion(m)` records the current version (0 if the DB is fresh).
4. `m.Up()` applies all pending migrations. `ErrNoChange` is expected and ignored — right now there are no migrations, so this is always `ErrNoChange` → nothing happens. Any *other* error is wrapped and returned.
5. `after := schemaVersion(m)` reads the new version; the function returns `after - before` as the count applied this run.

**`schemaVersion`** — a tiny helper. `m.Version()` returns `(version, dirty, err)`; we only need the version, and any error (notably `ErrNilVersion` on a fresh DB) means "version 0". Because Watch numbers migrations sequentially (`0001`, `0002`, …), the version number *is* the count of applied migrations, so `after - before` is the number applied this run. (A migration tool using timestamp versions couldn't do this; sequential numbering is what makes it clean.)

## File 2 — `apps/server/cmd/watch/main.go`

An edit. After the `store.New` success block (the `defer st.Close()` line) and **before** the `"watch starting"` log, run migrations:

```go
	applied, err := store.RunMigrations(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("migrations applied", "count", applied)
```

No new imports — `store` is already imported from Task 3. The boot sequence is now: load config → slog → signal context → connect pool → **run migrations** → "watch starting" → block → shutdown.

### What each block does

**`store.RunMigrations(cfg.DatabaseURL)`** — pass the same connection string the pool uses. Migrate opens its own connection from it, applies pending migrations, and closes.

**The error branch** — a failed migration is fatal: if the schema can't be brought up to date, the server must not serve traffic against a half-built database. Log and `os.Exit(1)`.

**`logger.Info("migrations applied", "count", applied)`** — emits `{"msg":"migrations applied","count":0}`. That `count:0` is the README's "migrations applied: 0" — proof the embed + iofs + postgres wiring all line up.

## File 3 — `apps/server/internal/store/migrations/.keep`

Create the directory and an empty placeholder file:

```bash
mkdir -p apps/server/internal/store/migrations
touch apps/server/internal/store/migrations/.keep
```

Git doesn't track empty directories, and `//go:embed all:migrations` needs the directory to exist with at least one file. `.keep` is that file. Task 5 adds the real `.sql` migrations next to it; the `.keep` can stay or be removed once `.sql` files exist.

## Verification

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
```

Expected startup log lines, in order:

```json
{"time":"...","level":"INFO","msg":"connected to Postgres"}
{"time":"...","level":"INFO","msg":"migrations applied","count":0}
{"time":"...","level":"INFO","msg":"watch starting", ...}
```

Confirm golang-migrate created its bookkeeping table (and nothing else yet):

```bash
psql "$DATABASE_URL" -c "\dt"
# only: schema_migrations
```

Press Ctrl-C → clean shutdown. Then the static checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four green.

## Lint, commit, push, PR

Branch off `main`:

```bash
git checkout main && git pull
git checkout -b feat/m1-migration-tooling
```

Stage and commit:

```bash
git add apps/server/internal/store/migrate.go \
        apps/server/internal/store/migrations/.keep \
        apps/server/cmd/watch/main.go \
        apps/server/go.mod \
        apps/server/go.sum \
        docs/milestone-1/task-4-migration-tooling.md
git commit -m "feat: run database migrations on startup"
git push -u origin feat/m1-migration-tooling
```

Open the PR using the **Task 4** entry in [commit-and-pr-guide.md](commit-and-pr-guide.md) — title `feat: run database migrations on startup` and the description there.

## Common gotchas

### `pattern migrations: no matching files found` (build fails)

You used `//go:embed migrations` or `//go:embed migrations/*.sql`. With only `.keep` present (a dotfile) and no `.sql` files, both fail at compile time. Use `//go:embed all:migrations` — the `all:` prefix includes dotfiles so the directory embeds successfully.

### `unknown driver postgres (forgotten import?)`

The blank import `_ "github.com/golang-migrate/migrate/v4/database/postgres"` is missing. It registers the `postgres://` scheme; without it, `NewWithSourceInstance` can't open the database.

### `error parsing dsn` or the migrate driver rejects the URL

`golang-migrate`'s standard postgres driver expects a `postgres://` URL (not `pgx5://`). Our `DATABASE_URL` already uses `postgres://...?sslmode=disable`, which is correct for the local Compose Postgres (no TLS).

### `count` is not 0 / unexpected number

`schemaVersion` assumes sequential `0001`, `0002`, … filenames. If you experiment with a stray migration and then remove it, the recorded version in `schema_migrations` may not match the embedded files — you can see a non-zero or mismatched count. For a fresh DB with no migrations, it's always 0.

### `Dirty database version N. Fix and force version.`

A previous migration failed midway and left the `schema_migrations` row marked *dirty*. There are no migrations yet in Task 4, so this shouldn't happen; if it does later, inspect the failure, fix the SQL, and `migrate force <version>` (or drop the dev database and let it re-apply).

## What this task does NOT do

- **No tables.** The seven foundational tables arrive in Task 5's `0001_foundational_tables.up.sql`. Right now only `schema_migrations` exists.
- **No down-migrations at runtime.** `watch` only runs `Up()` on startup. `.down.sql` files exist for manual rollback during development, not automatic execution.
- **No HTTP server.** Still Task 6.
- **No CLI.** Migrations run on boot, not via a separate `migrate` command. (You can still install the `migrate` CLI locally for ad-hoc inspection if you want.)

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-migration-tooling
```

Next up: **Task 5 — `feat/m1-foundational-schema`**. We write `0001_foundational_tables.up.sql` / `.down.sql` creating `organizations`, `users`, `projects`, `environments`, `ingestion_keys`, `raw_events`, and `dropped_event_counters` — and on next startup `migrations applied` jumps to `1`.

The Task 5 walkthrough will land at `docs/milestone-1/task-5-foundational-schema.md` in that PR.
