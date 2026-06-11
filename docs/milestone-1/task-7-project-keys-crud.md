# Task 7 — Project & Ingestion Key CRUD

The dashboard API gets its first real endpoints. We add CRUD for **projects**, **environments**, and **ingestion keys** — the objects a human needs to onboard a frontend app and mint the key its SDK will use. This is the first task that both **reads and writes** the schema from Task 5.

For the broader milestone context, see [README.md](README.md) — especially [§4 The Data Model](README.md#4-the-data-model) and [§5 the dashboard flow](README.md#5-requestresponse-flows). Builds on the `api` package from [task-6-health-endpoint.md](task-6-health-endpoint.md) and the pool from [task-3-postgres-pool.md](task-3-postgres-pool.md).

## Goal

> CRUD endpoints for projects + environments + ingestion keys, **without auth** (auth comes in Task 9, explicitly noted in the PR body).
>
> Done when curl can create a project, get its key, mint a second key, revoke the first, list projects, and see the right state.

The endpoints:

| Method & path | Does |
| --- | --- |
| `POST /api/projects` | Create a project + auto-create a `production` environment + an initial key |
| `GET /api/projects` | List projects with their environments and keys |
| `POST /api/projects/{id}/environments` | Add another environment |
| `POST /api/environments/{id}/keys` | Mint a new key |
| `DELETE /api/keys/{id}` | Revoke a key (sets `revoked_at`; never deletes the row) |

## Why this task exists

An SDK can't send events until a project exists and has an ingestion key. This task is the minimum dashboard surface to produce those — so Task 8 (ingestion) has real keys to validate against, and the future dashboard UI (M6) has endpoints to call.

**No auth yet.** These routes are wide open until Task 9 wraps `/api/*` in session + CSRF middleware. That's a deliberate, sequenced choice — call it out in the PR so a reviewer doesn't think it's an oversight.

> **Design note — the organization bridge.** `projects.organization_id` is `NOT NULL`, but no `organizations` row exists yet (Task 5 seeded none; the first owner/org arrives with auth in Task 9). Since Watch v1 is **single-organization**, the store **gets-or-creates one default organization** the first time a project is created, and reuses it thereafter. Task 9 will adopt that same single row. This is a temporary bridge — flagged so it's easy to revisit.

## Concept primer

- **REST resources** — each noun (project, environment, key) is a URL. `POST` creates, `GET` lists, `DELETE` removes. Nesting (`/projects/{id}/environments`) expresses "environment belongs to project".
- **Go 1.22 `ServeMux` wildcards** — `mux.HandleFunc("POST /api/projects/{id}/environments", h)` captures `{id}`; read it with `r.PathValue("id")`. Method + path matching is built in — no router library needed.
- **JSON in/out** — `json.NewDecoder(r.Body).Decode(&req)` to read, the existing `writeJSON` helper to respond. Validate required fields before touching the DB.
- **Transaction** — `pool.Begin(ctx)` → run several statements → `tx.Commit(ctx)`. If anything fails, `defer tx.Rollback(ctx)` undoes the lot. Creating a project + its environment + its first key must be **all-or-nothing**, so it runs in one transaction.
- **`pgx` query methods** — `QueryRow(...).Scan(...)` for a single row (e.g. `RETURNING`), `Query(...)` + `rows.Scan` in a loop for many, `Exec(...)` when you only need the affected-row count.
- **UUIDs as strings (no extra dependency)** — Postgres `uuid` doesn't scan into a Go `string` by default in pgx. To stay dependency-free we cast at the SQL boundary: `SELECT id::text` on the way out, and `$1::uuid` on the way in. (Adding `github.com/google/uuid` + pgx's uuid support is the alternative if you'd rather carry typed UUIDs.)
- **`crypto/rand`** — cryptographically secure randomness for the public key. Never `math/rand` for anything a client authenticates with.
- **Soft revoke** — revoking a key sets `revoked_at`; the row stays so historical events remain attributable ([README §4](README.md#ingestion_keys)).

## File 1 — `apps/server/internal/store/projects.go`

All database access lives in `store`. Create `projects.go`:

```go
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ErrNotFound is returned when a referenced parent row (project, environment)
// doesn't exist. Handlers map it to HTTP 404.
var ErrNotFound = errors.New("not found")

// Project, Environment, and IngestionKey mirror their rows. IDs and timestamps
// are strings (we cast uuid/timestamptz to text in queries) to stay free of
// extra dependencies.
type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedAt string `json:"created_at"`
}

type Environment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

type IngestionKey struct {
	ID        string  `json:"id"`
	PublicKey string  `json:"public_key"`
	CreatedAt string  `json:"created_at"`
	RevokedAt *string `json:"revoked_at"` // nil while active
}

// ProjectDetail is a project with its environments, each with its keys —
// the shape GET /api/projects returns.
type ProjectDetail struct {
	Project
	Environments []EnvironmentDetail `json:"environments"`
}

type EnvironmentDetail struct {
	Environment
	Keys []IngestionKey `json:"keys"`
}

// CreateProject creates a project plus a default "production" environment and
// an initial ingestion key, atomically. Returns the project with that env+key.
func (s *Store) CreateProject(ctx context.Context, name string) (ProjectDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProjectDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful Commit

	orgID, err := defaultOrganizationID(ctx, tx)
	if err != nil {
		return ProjectDetail{}, err
	}

	var p Project
	err = tx.QueryRow(ctx,
		`INSERT INTO projects (organization_id, name, slug)
		 VALUES ($1::uuid, $2, $3)
		 RETURNING id::text, name, slug, created_at::text`,
		orgID, name, slugify(name),
	).Scan(&p.ID, &p.Name, &p.Slug, &p.CreatedAt)
	if err != nil {
		return ProjectDetail{}, fmt.Errorf("insert project: %w", err)
	}

	env, err := insertEnvironment(ctx, tx, p.ID, "production")
	if err != nil {
		return ProjectDetail{}, err
	}
	key, err := insertIngestionKey(ctx, tx, env.ID)
	if err != nil {
		return ProjectDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ProjectDetail{}, fmt.Errorf("commit: %w", err)
	}

	return ProjectDetail{
		Project:      p,
		Environments: []EnvironmentDetail{{Environment: env, Keys: []IngestionKey{key}}},
	}, nil
}

// ListProjects returns every project with its environments and keys. Three flat
// queries grouped in Go, rather than N+1 per-project lookups.
func (s *Store) ListProjects(ctx context.Context) ([]ProjectDetail, error) {
	projRows, err := s.pool.Query(ctx,
		`SELECT id::text, name, slug, created_at::text FROM projects ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("query projects: %w", err)
	}
	projects, err := pgx.CollectRows(projRows, func(r pgx.CollectableRow) (ProjectDetail, error) {
		var p ProjectDetail
		return p, r.Scan(&p.ID, &p.Name, &p.Slug, &p.CreatedAt)
	})
	if err != nil {
		return nil, err
	}

	// Index environments by project id, and prepare to attach keys by env id.
	envByProject := map[string][]EnvironmentDetail{}
	envIndex := map[string]*EnvironmentDetail{} // env id -> pointer into the slices below
	envRows, err := s.pool.Query(ctx,
		`SELECT id::text, project_id::text, name, created_at::text FROM environments ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("query environments: %w", err)
	}
	defer envRows.Close()
	for envRows.Next() {
		var e EnvironmentDetail
		var projectID string
		if err := envRows.Scan(&e.ID, &projectID, &e.Name, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Keys = []IngestionKey{}
		envByProject[projectID] = append(envByProject[projectID], e)
	}
	if err := envRows.Err(); err != nil {
		return nil, err
	}
	// Build the env-id index after slices are stable.
	for pid := range envByProject {
		for i := range envByProject[pid] {
			envIndex[envByProject[pid][i].ID] = &envByProject[pid][i]
		}
	}

	keyRows, err := s.pool.Query(ctx,
		`SELECT id::text, environment_id::text, public_key, created_at::text, revoked_at::text
		 FROM ingestion_keys ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("query keys: %w", err)
	}
	defer keyRows.Close()
	for keyRows.Next() {
		var k IngestionKey
		var envID string
		if err := keyRows.Scan(&k.ID, &envID, &k.PublicKey, &k.CreatedAt, &k.RevokedAt); err != nil {
			return nil, err
		}
		if e := envIndex[envID]; e != nil {
			e.Keys = append(e.Keys, k)
		}
	}
	if err := keyRows.Err(); err != nil {
		return nil, err
	}

	for i := range projects {
		projects[i].Environments = envByProject[projects[i].ID]
		if projects[i].Environments == nil {
			projects[i].Environments = []EnvironmentDetail{}
		}
	}
	return projects, nil
}

// CreateEnvironment adds an environment to an existing project.
func (s *Store) CreateEnvironment(ctx context.Context, projectID, name string) (Environment, error) {
	if !s.exists(ctx, "projects", projectID) {
		return Environment{}, ErrNotFound
	}
	return insertEnvironment(ctx, s.pool, projectID, name)
}

// CreateIngestionKey mints a new key on an existing environment.
func (s *Store) CreateIngestionKey(ctx context.Context, environmentID string) (IngestionKey, error) {
	if !s.exists(ctx, "environments", environmentID) {
		return IngestionKey{}, ErrNotFound
	}
	return insertIngestionKey(ctx, s.pool, environmentID)
}

// RevokeKey soft-revokes a key. Returns ErrNotFound if no active key matched.
func (s *Store) RevokeKey(ctx context.Context, keyID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE ingestion_keys SET revoked_at = now()
		 WHERE id = $1::uuid AND revoked_at IS NULL`, keyID)
	if err != nil {
		return fmt.Errorf("revoke key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- helpers ---

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so insert helpers
// work inside or outside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func defaultOrganizationID(ctx context.Context, q querier) (string, error) {
	var id string
	err := q.QueryRow(ctx, `SELECT id::text FROM organizations ORDER BY created_at LIMIT 1`).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("select org: %w", err)
	}
	// None yet — create the single default org (v1 is single-organization).
	err = q.QueryRow(ctx,
		`INSERT INTO organizations (name) VALUES ('Watch') RETURNING id::text`).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create default org: %w", err)
	}
	return id, nil
}

func insertEnvironment(ctx context.Context, q querier, projectID, name string) (Environment, error) {
	var e Environment
	err := q.QueryRow(ctx,
		`INSERT INTO environments (project_id, name) VALUES ($1::uuid, $2)
		 RETURNING id::text, name, created_at::text`,
		projectID, name,
	).Scan(&e.ID, &e.Name, &e.CreatedAt)
	if err != nil {
		return Environment{}, fmt.Errorf("insert environment: %w", err)
	}
	return e, nil
}

func insertIngestionKey(ctx context.Context, q querier, environmentID string) (IngestionKey, error) {
	var k IngestionKey
	err := q.QueryRow(ctx,
		`INSERT INTO ingestion_keys (environment_id, public_key) VALUES ($1::uuid, $2)
		 RETURNING id::text, public_key, created_at::text, revoked_at::text`,
		environmentID, newPublicKey(),
	).Scan(&k.ID, &k.PublicKey, &k.CreatedAt, &k.RevokedAt)
	if err != nil {
		return IngestionKey{}, fmt.Errorf("insert ingestion key: %w", err)
	}
	return k, nil
}

func (s *Store) exists(ctx context.Context, table, id string) bool {
	var one int
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT 1 FROM %s WHERE id = $1::uuid`, table), id).Scan(&one)
	return err == nil
}

// newPublicKey returns an opaque, SDK-embeddable key: "pk_" + 24 hex chars.
func newPublicKey() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b) // crypto/rand.Read never returns an error on supported platforms
	return "pk_" + hex.EncodeToString(b)
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slugify turns "Customer Portal" into "customer-portal".
func slugify(name string) string {
	s := nonSlug.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	return strings.Trim(s, "-")
}
```

### Notes on this file

- **`querier` interface** lets `insertEnvironment`/`insertIngestionKey` run either inside `CreateProject`'s transaction (passing `tx`) or standalone (passing `s.pool`). Both implement `QueryRow`.
- **`exists` uses `fmt.Sprintf` for the table name** — safe here because `table` is a hardcoded constant we pass (`"projects"`/`"environments"`), never user input. The `id` is always a bound `$1` parameter, never interpolated.
- **`RevokedAt *string`** — a pointer so JSON shows `null` for an active key and a timestamp once revoked. `revoked_at::text` yields `NULL` → `nil`.
- The `::text` / `$1::uuid` casts are the dependency-free UUID handling from the primer.

## File 2 — `apps/server/internal/api/projects.go`

Handlers live in the `api` package and reuse `writeJSON` from `api.go`. Create `projects.go`:

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

func (a *API) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	project, err := a.store.CreateProject(r.Context(), req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create project")
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (a *API) handleListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.store.ListProjects(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list projects")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (a *API) handleCreateEnvironment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	env, err := a.store.CreateEnvironment(r.Context(), r.PathValue("id"), req.Name)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create environment")
		return
	}
	writeJSON(w, http.StatusCreated, env)
}

func (a *API) handleCreateKey(w http.ResponseWriter, r *http.Request) {
	key, err := a.store.CreateIngestionKey(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "environment not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create key")
		return
	}
	writeJSON(w, http.StatusCreated, key)
}

func (a *API) handleRevokeKey(w http.ResponseWriter, r *http.Request) {
	err := a.store.RevokeKey(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "active key not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke key")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

And add the small `writeError` helper next to `writeJSON` in `api.go`:

```go
// writeError sends a JSON { "error": msg } with the given status.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
```

### Notes

- **Status codes:** `201 Created` for the POSTs, `200 OK` for list, `204 No Content` for revoke (nothing to return), `400` for bad input, `404` for unknown parent / no active key, `500` otherwise.
- Errors return `{ "error": "..." }` with human-readable messages — never raw DB errors (which can leak schema details). Internal detail stays in logs.

## File 3 — register the routes in `apps/server/internal/api/api.go`

Extend `Handler()` (it already wires `/health`):

```go
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.handleHealth)

	mux.HandleFunc("POST /api/projects", a.handleCreateProject)
	mux.HandleFunc("GET /api/projects", a.handleListProjects)
	mux.HandleFunc("POST /api/projects/{id}/environments", a.handleCreateEnvironment)
	mux.HandleFunc("POST /api/environments/{id}/keys", a.handleCreateKey)
	mux.HandleFunc("DELETE /api/keys/{id}", a.handleRevokeKey)

	return mux
}
```

No `main.go` change — it already serves `api.New(st).Handler()`.

## Verification

Bring the stack up and run watch (Postgres + migrations from earlier tasks):

```bash
set -a; source .env; set +a
docker compose -f deploy/docker-compose.yml up -d
pnpm --filter @watch/server dev
```

In another shell, walk the full lifecycle:

```bash
# Create a project — returns the production environment and its first key.
curl -s -X POST localhost:8080/api/projects \
  -H 'Content-Type: application/json' -d '{"name":"Customer Portal"}' | jq

# Grab ids from the response, then mint a SECOND key on that environment:
ENV_ID=...   # environments[0].id from the create response
curl -s -X POST localhost:8080/api/environments/$ENV_ID/keys | jq

# Revoke the FIRST key:
KEY_ID=...   # environments[0].keys[0].id from the create response
curl -s -i -X DELETE localhost:8080/api/keys/$KEY_ID   # 204 No Content

# List — two keys on the production env; the first has a non-null revoked_at.
curl -s localhost:8080/api/projects | jq
```

Spot-check the database directly:

```bash
psql "$DATABASE_URL" -c "SELECT public_key, revoked_at FROM ingestion_keys ORDER BY created_at;"
# one row with a revoked_at timestamp, one with NULL
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
git checkout -b feat/m1-project-keys-crud
```

Stage your changes:

```bash
git add apps/server/internal/store/projects.go \
        apps/server/internal/api/projects.go \
        apps/server/internal/api/api.go \
        docs/milestone-1/task-7-project-keys-crud.md
```

Commit and push. **Generate the commit message at commit time** from your staged diff following [AGENTS.md](../../AGENTS.md) conventions (`<type>: <imperative summary>` — ask Claude to draft it from `git diff --staged` if you like):

```bash
git commit                                    # write/paste the generated message
git push -u origin feat/m1-project-keys-crud
```

Open the PR — the body auto-fills from [.github/pull_request_template.md](../../.github/pull_request_template.md). Fill its sections from the diff (or ask Claude to draft them). **Call out in the body that these endpoints are intentionally unauthenticated until Task 9.**

## Common gotchas

### `operator does not exist: uuid = text`

A `WHERE id = $1` or `VALUES ($1, ...)` where the column is `uuid` but you passed a Go string. Add the cast: `$1::uuid`. (And `SELECT id::text` when scanning back into a string.)

### `cannot scan uuid` / `cannot scan timestamptz into *string`

Same root cause on the read side — you scanned a `uuid`/`timestamptz` column straight into a `string`. Cast in the query: `id::text`, `created_at::text`, `revoked_at::text`.

### Duplicate project name → `23505` unique violation

`UNIQUE (organization_id, slug)` means two projects that slugify to the same value collide. For M1 the create returns a 500 today; if you want a friendlier `409 Conflict`, detect the pgx error: `var pgErr *pgconn.PgError; if errors.As(err, &pgErr) && pgErr.Code == "23505"`. Optional polish.

### `GET /api/projects` shows `null` for environments/keys

JSON `null` vs `[]`: the code initializes empty slices (`[]EnvironmentDetail{}`, `[]IngestionKey{}`) precisely so the API returns empty arrays, not `null`. If you simplify the code, keep that or clients must handle both.

### Route doesn't match / 405

Go 1.22 method routing needs the method in the pattern (`"POST /api/projects"`). A bare `"/api/projects"` matches all methods and breaks the GET/POST split.

## What this task does NOT do

- **No auth.** `/api/*` is open until Task 9 adds session + CSRF middleware and role gating. Stated in the PR body.
- **No update/rename/delete-project.** Only create + list + revoke-key, per the spec. Renaming projects or deleting environments is out of scope.
- **No pagination or filtering** on the list. Fine at M1 volumes.
- **No org management.** The single default org is auto-created; multi-org is a non-goal of v1.

## After this PR merges

Sync and clean up:

```bash
git checkout main
git pull
git branch -d feat/m1-project-keys-crud
```

Next up: **Task 8 — `feat/m1-ingest-endpoint`**. We add `POST /ingest/{key}` — resolve the public key, validate origin/size/schema, store accepted events in `raw_events`, and increment `dropped_event_counters` on every rejection path (`401`/`403`/`400`/`413`). It's the first endpoint the browser SDK will talk to.

The Task 8 walkthrough will land at `docs/milestone-1/task-8-ingest-endpoint.md` in that PR.
