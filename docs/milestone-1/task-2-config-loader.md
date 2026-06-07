# Task 2 — Config Loader

The first Go code lands. We write `apps/server/internal/config/config.go` to read environment variables into a typed struct, and wire it into `cmd/watch/main.go` so the server fails fast when required configuration is missing.

For the broader milestone context, see [README.md](README.md). For Task 1's setup (Compose + Postgres), see [task-1-compose-postgres.md](task-1-compose-postgres.md).

## Goal

> Read env vars into a typed Go config struct; fail fast on missing required vars.
>
> `pnpm dev` logs the loaded config on startup. Removing `DATABASE_URL` from env causes watch to exit with a clear error.

That's it. No database connection, no HTTP server, no migrations. Just env → struct → log → exit cleanly.

## Why this task exists

Hardcoded values are a trap. The first time you deploy to staging you discover that `localhost:5432` is wrong and the password should be different. Configuration belongs in env vars — set by Docker Compose locally, by k8s in production, by you in the shell during dev.

But raw `os.Getenv` calls scattered through the codebase are equally bad. You can't see all the config at once, you can't validate it on boot, you can't change a default in one place. So we centralise: one package whose job is "read env, validate, hand back a typed struct."

Every M1 task after this one starts the same way: load the config, then use the fields. The struct is the single source of truth for what configuration the server reads.

## Concept primer

The Go vocabulary you'll meet in the file:

- **Package** — a folder of `.go` files sharing the same `package <name>` declaration. Each package is independently importable. Our `internal/config` package will be imported by `cmd/watch`.
- **`internal/` folder** — a Go convention. Code under `internal/` can only be imported by code in the same module. Protects against external code accidentally depending on implementation details.
- **`os.Getenv(key)`** — returns the env var's value as a string, or empty string if unset. Never returns an error; you check for empty.
- **`errors.New("...")`** — creates a basic error value. Go errors are values; you return them alongside the result.
- **Multi-value return** — Go functions can return multiple values. The idiom is `result, err := SomeFunc()` followed by `if err != nil { handle }`.
- **Struct method** — a function with a receiver. `func (c Config) Foo()` means "Foo is a method on Config; inside it, the value is named `c`". Value receivers are immutable; pointer receivers (`*Config`) can mutate.
- **`net/url`** — Go's stdlib URL parser. `url.Parse(s)` returns a `*URL` you can manipulate (read fields, edit, re-format with `.String()`).
- **`slog`** — Go's stdlib structured logging. Replaced `log` as the recommended default in Go 1.21. Logs are emitted as JSON objects (or text) with named fields, not free-form strings.
- **`slog.HandlerOptions{Level: ...}`** — controls minimum log level. `slog.LevelDebug` < `slog.LevelInfo` < `slog.LevelWarn` < `slog.LevelError`. Logs below the threshold are dropped.
- **`os.Exit(1)`** — terminate the process with non-zero status. Used for fail-fast. Important: `os.Exit` does **not** run deferred functions; reserve it for boot-time failures, not normal shutdown.
- **`go:embed`** (we won't use this in Task 2 but you'll see it in Task 4) — Go's compile-time file embedding directive.

## File 1 — `apps/server/internal/config/config.go`

Delete the existing one-line placeholder `apps/server/internal/config/doc.go` (you can do this in your editor or with `rm apps/server/internal/config/doc.go`) and create `config.go` in the same directory with the following content.

```go
// Package config loads the runtime configuration for watch from the
// environment. The struct it returns is the single source of truth for
// what env vars the server reads; the rest of the codebase should never
// call os.Getenv directly.
package config

import (
	"errors"
	"net/url"
	"os"
	"strings"
)

// Config holds the runtime configuration for watch. All fields are
// populated by Load() from the process environment. The struct is
// immutable after construction; pass it around by value.
type Config struct {
	// DatabaseURL is the Postgres connection string. Required.
	// Example: postgres://watch:watch@localhost:5432/watch?sslmode=disable
	DatabaseURL string

	// ListenAddr is the address the HTTP server binds to.
	// Defaults to ":8080". Format follows net.Listen ("host:port" or ":port").
	ListenAddr string

	// LogLevel sets the minimum slog level. One of: debug, info, warn, error.
	// Defaults to "info". Case-insensitive.
	LogLevel string
}

// Load reads env vars and returns a populated Config. Returns an error
// if any required variable is missing or empty.
func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
		ListenAddr:  getenvDefault("WATCH_LISTEN_ADDR", ":8080"),
		LogLevel:    getenvDefault("WATCH_LOG_LEVEL", "info"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	return cfg, nil
}

// RedactedDatabaseURL returns DatabaseURL with the password masked to
// "***". Safe to log. Returns "<unparseable>" if the URL can't be parsed.
func (c Config) RedactedDatabaseURL() string {
	u, err := url.Parse(c.DatabaseURL)
	if err != nil {
		return "<unparseable>"
	}
	if u.User != nil {
		username := u.User.Username()
		u.User = url.UserPassword(username, "***")
	}
	return u.String()
}

// getenvDefault returns the env var's value (after trimming whitespace)
// if non-empty; otherwise returns fallback.
func getenvDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
```

### What each block does

**The package comment** (the `// Package config ...` block above the package declaration) — Go's tool `godoc` extracts this as the package summary. Convention: write it as if completing the sentence "Package <name> ...". Every reusable package gets one.

**`package config`** — declares this file belongs to the `config` package. Every file in `apps/server/internal/config/` must have the same package declaration.

**Imports** — alphabetised by Go convention. `errors` for the basic error type, `net/url` for URL parsing, `os` for env access, `strings` for whitespace trimming.

**`type Config struct { ... }`** — the data type. Three string fields with doc comments. The fields are **exported** (capitalised) because code in `cmd/watch` needs to read them. Lowercase fields would be package-private.

**`func Load() (Config, error)`** — the only exported function besides the methods on `Config`. Returns the struct by **value**, not pointer — the config is small (three strings) and immutable, so copying is cheap and prevents accidental mutation.

The function:
1. Constructs a `Config` by reading three env vars. `strings.TrimSpace` defends against leading/trailing whitespace from manually-edited `.env` files.
2. `getenvDefault` falls back to a default when the var is unset or empty.
3. Validates `DatabaseURL` is non-empty. If empty, returns a zero `Config{}` and an error.

The "fail fast" principle: don't return a half-configured struct hoping the caller will check. The caller gets *either* a valid config *or* an error. Never both.

**`func (c Config) RedactedDatabaseURL() string`** — a method on `Config`. The `(c Config)` part is the **receiver**: when you call `cfg.RedactedDatabaseURL()`, the value of `cfg` is bound to `c` inside the method body. Value receiver, not pointer — we don't mutate; we return a new string.

The method:
1. Parses the URL with `url.Parse`. If the input was somehow invalid (shouldn't happen, but defensive), return a sentinel string instead of crashing.
2. If the URL has a user-info section (`watch:watch` in our case), replace the password with `***` while preserving the username.
3. Re-format with `u.String()`. This safely re-encodes any special characters.

This is the only function in the package that handles the *raw* password. The rest of the codebase only ever sees the redacted form when logging.

**`func getenvDefault(key, fallback string) string`** — an unexported helper. Lowercase first letter means it's not visible outside the package. Reads the var, trims whitespace, returns it if non-empty; otherwise returns `fallback`.

## File 2 — `apps/server/cmd/watch/main.go`

Replace the current contents of `main.go` with:

```go
// watch is the Watch backend server: ingestion API, dashboard API,
// background worker, and alerting. See docs/architecture.md for the
// big-picture diagram.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/AgiriTaofeek/watch/apps/server/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// Boot-time failures bypass slog setup — emit a plain message
		// and exit. Process supervisors (Docker, systemd, k8s) read
		// stderr regardless of structured-logging conventions.
		_, _ = os.Stderr.WriteString("config load failed: " + err.Error() + "\n")
		os.Exit(1)
	}

	// Build the slog handler with the requested level and install it
	// as the default. Every package that calls slog.* downstream sees
	// the same handler.
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLogLevel(cfg.LogLevel),
	})
	logger := slog.New(handler)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("watch starting",
		"listen_addr", cfg.ListenAddr,
		"log_level", cfg.LogLevel,
		"database_url", cfg.RedactedDatabaseURL(),
	)

	<-ctx.Done()
	logger.Info("watch shutting down")
}

// parseLogLevel converts a string log level into the slog.Level enum.
// Unknown values fall back to LevelInfo so a typo doesn't silently
// suppress all logs.
func parseLogLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
```

### What each block does

**The package comment** at the top — same convention as the config package. Describes what `watch` is.

**`import (...)`** block:
- Standard library imports first.
- A blank line separator.
- Third-party / local imports below. Our local import is `github.com/AgiriTaofeek/watch/apps/server/internal/config` — the module path declared in `go.mod` followed by the package's directory path.

**`cfg, err := config.Load()`** — the canonical Go pattern. Function returns two values; the caller binds both and checks the error first.

**The boot-error branch** — when `Load` fails, the slog handler isn't set up yet (we don't know what level to use). We bypass slog, write the error directly to stderr, and exit with status 1. The `_, _ =` ignores `WriteString`'s return values; we're about to exit anyway so failed writes don't matter.

**`slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: ...})`** — constructs a handler that emits JSON to stdout, filtered to the requested level. JSON is the right default for production (log aggregators parse it directly).

**`slog.SetDefault(logger)`** — installs this logger as the global default. Now any package that calls `slog.Info(...)`, `slog.Debug(...)`, etc. uses this handler. Without this, third-party libraries logging through `slog` would write to whatever the original default was.

**`signal.NotifyContext`** — creates a context that's cancelled when SIGINT (Ctrl-C) or SIGTERM arrives. `defer stop()` ensures the signal handler is unregistered when `main` exits.

**`logger.Info("watch starting", "key", value, ...)`** — slog's structured logging. The first arg is the message; remaining args are alternating key/value pairs that become JSON fields. Output looks like:

```json
{"time":"2026-06-01T12:34:56Z","level":"INFO","msg":"watch starting","listen_addr":":8080","log_level":"info","database_url":"postgres://watch:***@localhost:5432/watch?sslmode=disable"}
```

Notice `database_url` shows `***` for the password — that's `RedactedDatabaseURL()` doing its job.

**`<-ctx.Done()`** — blocks until the context is cancelled. When you Ctrl-C, the signal handler cancels the context, this channel receives, and execution falls through to the shutdown log line and process exit.

**`parseLogLevel`** — small helper at the bottom of the file. Default to `LevelInfo` for unknown inputs so a typo (`WATCH_LOG_LEVEL=infio`) doesn't accidentally silence all logs.

## Verification

Load env vars (Compose still reads `.env` automatically for Postgres; your shell needs them too for watch):

```bash
set -a; source .env; set +a
```

Confirm `DATABASE_URL` is populated:

```bash
echo "$DATABASE_URL"
# postgres://watch:watch@localhost:5432/watch?sslmode=disable
```

Make sure Postgres is running (from Task 1):

```bash
docker compose -f deploy/docker-compose.yml ps
# should be (healthy)
```

Run watch through air (auto-rebuild on save) via the dev script:

```bash
pnpm --filter @watch/server dev
```

Expected log line:

```json
{"time":"...","level":"INFO","msg":"watch starting","listen_addr":":8080","log_level":"info","database_url":"postgres://watch:***@localhost:5432/watch?sslmode=disable"}
```

Press Ctrl-C. Expected:

```json
{"time":"...","level":"INFO","msg":"watch shutting down"}
```

Process exits cleanly.

Now prove fail-fast on missing `DATABASE_URL`:

```bash
DATABASE_URL= pnpm --filter @watch/server dev
```

Expected (on stderr, not in JSON form):

```
config load failed: DATABASE_URL is required
```

Process exits with non-zero status. `air` reports the failed build and waits for changes.

Try a debug-level log:

```bash
WATCH_LOG_LEVEL=debug pnpm --filter @watch/server dev
```

The `"watch starting"` line shows `"log_level":"debug"`. (We don't have any debug logs to emit yet, but the level is plumbed through.)

Finally run the static checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four green.

## Lint, commit, push, PR

From repo root, stage your changes:

```bash
git add apps/server/internal/config/config.go \
        apps/server/cmd/watch/main.go \
        docs/milestone-1/task-2-config-loader.md
git rm apps/server/internal/config/doc.go
```

Commit and push. **Generate the commit message at commit time** from your staged diff following [AGENTS.md](../../AGENTS.md) conventions (`<type>: <imperative summary>` — ask Claude to draft it from `git diff --staged` if you like):

```bash
git commit                                 # write/paste the generated message
git push -u origin feat/m1-config-loader
```

Open the PR — the body auto-fills from [.github/pull_request_template.md](../../.github/pull_request_template.md). Fill its sections from the diff (or ask Claude to draft them); the PR title is your commit message.

## Common gotchas

### `imports github.com/.../config; not found`

The import path in `main.go` must exactly match what's in `apps/server/go.mod`:

```
module github.com/AgiriTaofeek/watch/apps/server
```

So the import is:

```go
import "github.com/AgiriTaofeek/watch/apps/server/internal/config"
```

If you typoed the org name or the package path, the build fails. Re-read both files and confirm.

### `config load failed: DATABASE_URL is required` when you DO have a `.env`

The shell didn't load `.env`. Run `echo "$DATABASE_URL"` — if empty, you forgot `set -a; source .env; set +a`. Compose reads `.env` automatically; your shell does not.

If you'd rather not source it every terminal, add an alias or a tool like `direnv`. Or just remember to source it once per terminal session.

### `pnpm --filter @watch/server dev` doesn't seem to hot-reload

Air watches `apps/server/**/*.go` for changes (per `.air.toml` configured in Task 1's setup). If a save isn't triggering a rebuild, check:

- The file you edited is actually under `apps/server/` (not a sibling).
- Air didn't crash. Look at the air output in your terminal.
- The `.air.toml` `include_ext` line includes `go`.

### `slog.SetDefault` doesn't seem to affect anything

`slog.SetDefault` installs the handler for package-level functions like `slog.Info(...)`. If you're calling `logger.Info(...)` (where `logger` is your local variable), you're using your local handler regardless. Both are valid — the default matters for code that doesn't have access to your logger variable.

### `passed by value` golangci-lint warning

If golangci-lint complains about passing `Config` by value (e.g. the `gocritic.hugeParam` check), increase the size threshold or switch to pointer receivers. For a three-string struct it shouldn't fire, but if it does, switching to `*Config` is fine.

## What this task does NOT do

- **No Postgres connection.** `DatabaseURL` is just a string field. Connecting comes in Task 3 (`feat/m1-postgres-pool`).
- **No HTTP server.** `ListenAddr` is loaded but nothing binds to it yet. That's Task 6.
- **No env-file auto-loading.** You source `.env` in the shell or set vars another way. Production gets env from the deploy environment.
- **No strict validation.** We check `DatabaseURL` is non-empty; we don't parse it to confirm it's a valid Postgres URL. That happens implicitly in Task 3 when pgx tries to connect.
- **No config reloading.** The config is loaded once at boot. Changes to env require a restart.

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-config-loader
```

Next up: **Task 3 — `feat/m1-postgres-pool`**. We add `pgx/v5`, write `internal/store/store.go` with a connection pool, and wire it into `main.go` so watch connects to Postgres on startup. Task 3 is the first task with a third-party Go dependency.

The Task 3 walkthrough will land at `docs/milestone-1/task-3-postgres-pool.md` in that PR.
