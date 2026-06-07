# Task 6 — Health Endpoint

The server becomes reachable over HTTP. We start an `http.Server`, add a small `internal/api` package with `GET /health` that reports database connectivity, and wire **graceful shutdown** so Ctrl-C drains in-flight requests before exiting.

For the broader milestone context, see [README.md](README.md). This builds on the pool from [task-3-postgres-pool.md](task-3-postgres-pool.md) and the migrations from [task-4](task-4-migration-tooling.md)/[task-5](task-5-foundational-schema.md).

## Goal

> The server is reachable over HTTP and reports DB connectivity.
>
> `curl localhost:8080/health` returns `200` with `{"status":"ok","db":"reachable"}`. Stopping Postgres and re-curling returns `503` with `{"status":"degraded","db":"<error>"}`. Ctrl-C drains in-flight requests and shuts down cleanly.

## Why this task exists

Until now `watch` connects to Postgres and exits. This task makes it an actual *server* — it binds to a port and answers requests — and gives it the one endpoint every deployment needs first: a **health check**.

A health endpoint is what load balancers, Docker, and Kubernetes poll to decide "is this instance ready to receive traffic?". Ours goes one step further than a bare liveness check: it pings the database, so a `200` means "process up **and** database reachable," and a `503` means "process up but degraded." That distinction is what lets an orchestrator pull a broken instance out of rotation instead of sending it traffic it can't serve.

It also establishes the HTTP plumbing — router, server, graceful shutdown — that Tasks 7–9 hang their real endpoints on.

## Concept primer

- **`http.Server`** — the standard-library HTTP server. You give it an address and a handler; `ListenAndServe()` blocks serving requests until the server is shut down.
- **`http.ServeMux` + method routing** — the stdlib router. Since Go 1.22 you can register method + path patterns like `mux.HandleFunc("GET /health", ...)`, so a `POST /health` wouldn't match. (We're on Go 1.25.)
- **`http.Handler`** — anything with `ServeHTTP(w, r)`. The mux is a handler; we build one and hand it to the server.
- **Graceful shutdown** — `srv.Shutdown(ctx)` stops accepting new connections and waits for in-flight requests to finish (up to the context deadline), versus `srv.Close()` which drops them immediately. Graceful is what "drains in-flight requests" means.
- **`http.ErrServerClosed`** — the sentinel `ListenAndServe()` returns after a clean `Shutdown`. It's expected, not a failure, so we ignore it and treat anything else as a real error.
- **Goroutine + error channel** — `ListenAndServe` blocks, but `main` also needs to wait for the SIGINT/SIGTERM context. So we run the server in a goroutine and `select` on either a server error or the shutdown signal. Returning normally lets the deferred `st.Close()` run.
- **Per-request timeout** — the health handler pings the DB with a short `context.WithTimeout` so a hung database turns into a fast `503`, not a request that hangs forever.
- **`200` vs `503`** — `200 OK` = healthy; `503 Service Unavailable` = the server is up but a dependency (the DB) isn't. Returning `503` (not `500`) tells the caller "retry later," which is the correct signal for orchestrators.

## File 1 — `apps/server/internal/store/store.go` (add a `Ping` method)

So the `api` package can check connectivity without importing `pgx` itself, add one method next to `Pool`/`Close`:

```go
// Ping verifies the database is reachable. Used by the health endpoint.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }
```

`context` is already imported by `store.go`. This keeps the rule from Task 3 intact: only `store` touches `pgx`.

## File 2 — `apps/server/internal/api/api.go`

Delete the placeholder `apps/server/internal/api/doc.go` and create `api.go`:

```go
// Package api holds the HTTP handlers for watch — the ingestion API and the
// dashboard API. It builds the router the server serves.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

// API wires the HTTP handlers to their dependencies.
type API struct {
	store *store.Store
}

// New returns an API backed by the given store.
func New(st *store.Store) *API {
	return &API{store: st}
}

// Handler builds the router for the whole HTTP surface.
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.handleHealth)
	return mux
}

// handleHealth reports process liveness and database connectivity.
// 200 = up and DB reachable; 503 = up but a dependency is degraded.
func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := a.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "degraded",
			"db":     err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"db":     "reachable",
	})
}

// writeJSON encodes body as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
```

### What each block does

**`API` struct + `New`** — the handlers need the store to ping the DB. Holding dependencies on a struct (rather than globals) is what lets Tasks 7–9 add handlers that share the same store cleanly.

**`Handler()`** — builds the `http.ServeMux` and registers routes. Returning `http.Handler` keeps `main` ignorant of the routing details — it just serves whatever `Handler()` returns. `GET /health` uses Go 1.22+ method routing.

**`handleHealth`** — derives a 2-second context from the request, pings the store, and writes either `200 {"status":"ok",...}` or `503 {"status":"degraded","db":"<error>"}`. The timeout means a wedged database yields a prompt `503` instead of a hanging request.

**`writeJSON`** — a tiny helper: set the content type, write the status, encode the body. The `_ =` on `Encode` deliberately ignores the error (the response is already being written; there's nothing useful to do if the client disconnected mid-encode).

## File 3 — `apps/server/cmd/watch/main.go`

Replace the final block — from `logger.Info("watch starting", ...)` down through `logger.Info("watch shutting down")` — with a server that runs in a goroutine and shuts down gracefully:

```go
	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: api.New(st).Handler(),
	}

	// ListenAndServe blocks, so run it in a goroutine and report its error
	// on a channel. main then waits for either a server failure or a signal.
	srvErr := make(chan error, 1)
	go func() {
		logger.Info("watch starting",
			"listen_addr", cfg.ListenAddr,
			"log_level", cfg.LogLevel,
			"database_url", cfg.RedactedDatabaseURL(),
		)
		srvErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-srvErr:
		// ErrServerClosed is the clean-shutdown sentinel; anything else is real.
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server error", "error", err)
		}
	case <-ctx.Done():
		logger.Info("watch shutting down")
	}

	// Drain in-flight requests, up to a deadline, then stop.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
```

Add the new imports — `errors`, `net/http`, and the local `api` package:

```go
import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/api"
	"github.com/AgiriTaofeek/watch/apps/server/internal/config"
	"github.com/AgiriTaofeek/watch/apps/server/internal/logging"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)
```

### What each block does

**`srv := &http.Server{...}`** — binds `cfg.ListenAddr` (`:8080` by default) to the router from `api.New(st).Handler()`.

**Goroutine + `srvErr` channel** — `ListenAndServe` blocks until shutdown, but `main` must also watch the SIGINT/SIGTERM context. Running the server in a goroutine and sending its return value on a buffered channel lets the `select` below react to whichever happens first. The buffer (`1`) prevents the goroutine from leaking if `main` exits via the signal path.

**`select`** — either the server died on its own (e.g. the port is taken → log the real error) or a signal arrived (→ log "watch shutting down"). `http.ErrServerClosed` is filtered out because it's the expected result of a clean `Shutdown`.

**`srv.Shutdown(shutdownCtx)`** — stops accepting new connections and waits up to 10s for in-flight requests to finish. This is the "drains in-flight requests" behavior. Because `main` then returns normally, the deferred `st.Close()` (and `stop()`) run.

## Verification

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
```

In another terminal — healthy case:

```bash
curl -i localhost:8080/health
# HTTP/1.1 200 OK
# {"status":"ok","db":"reachable"}
```

Degraded case — stop Postgres, then curl again (the server stays up):

```bash
docker compose -f deploy/docker-compose.yml stop postgres
curl -i localhost:8080/health
# HTTP/1.1 503 Service Unavailable
# {"status":"degraded","db":"... connection refused"}
docker compose -f deploy/docker-compose.yml start postgres
```

Method routing — a non-GET is rejected:

```bash
curl -i -X POST localhost:8080/health
# HTTP/1.1 405 Method Not Allowed
```

Graceful shutdown — Ctrl-C the server; it logs `watch shutting down` and exits cleanly (in-flight requests get to finish). Then the static checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All green.

## Commit and open the PR

Stage your changes:

```bash
git add apps/server/internal/api/api.go \
        apps/server/internal/store/store.go \
        apps/server/cmd/watch/main.go \
        docs/milestone-1/task-6-health-endpoint.md
git rm apps/server/internal/api/doc.go
```

Commit and push. **Generate the commit message at commit time** from your staged diff following [AGENTS.md](../../AGENTS.md) conventions (`<type>: <imperative summary>` — ask Claude to draft it from `git diff --staged` if you like):

```bash
git commit                                  # write/paste the generated message
git push -u origin feat/m1-health-endpoint
```

Open the PR — the body auto-fills from [.github/pull_request_template.md](../../.github/pull_request_template.md). Fill its sections from the diff (or ask Claude to draft them); the PR title is your commit message.

## Common gotchas

### `curl: (7) Failed to connect to localhost port 8080`

The server isn't listening. Check the `watch starting` log appeared and that `cfg.ListenAddr` is `:8080`. If another process owns 8080, set `WATCH_LISTEN_ADDR` to a free port.

### `/health` returns 200 even with Postgres down

You're hitting a stale process, or the handler isn't pinging the store. Confirm `handleHealth` calls `a.store.Ping(ctx)` and that you restarted `watch` after editing.

### Ctrl-C hangs instead of draining

A handler is blocking past the 10s `Shutdown` deadline. For `/health` this won't happen, but keep handlers respectful of `r.Context()` cancellation as you add them in later tasks.

### `panic: pattern "GET /health" ... method` or routing not matching method

Method patterns require Go 1.22+. Confirm `go.mod` says `go 1.25` (it does) and you're not on an old toolchain.

### golangci-lint flags the ignored `Encode` error

`writeJSON` uses `_ = json.NewEncoder(w).Encode(body)` deliberately. `errcheck` accepts the explicit `_ =`.

## What this task does NOT do

- **No auth.** `/health` is public by design (orchestrators poll it unauthenticated). Sessions/CSRF arrive in Task 9.
- **No business endpoints.** Project/key CRUD is Task 7; ingestion is Task 8.
- **No readiness vs liveness split.** One `/health` endpoint for now; separate `/livez`/`/readyz` can come later if needed.
- **No request logging/metrics middleware.** Add it when there's traffic worth observing.

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-health-endpoint
```

Next up: **Task 7 — `feat/m1-project-keys-crud`**. We add the dashboard endpoints for projects, environments, and ingestion keys (`POST /api/projects`, `GET /api/projects`, `POST /api/projects/:id/environments`, `POST /api/environments/:id/keys`, `DELETE /api/keys/:id`) — still without auth, which lands in Task 9.

The Task 7 walkthrough will land at `docs/milestone-1/task-7-project-keys-crud.md` in that PR.
