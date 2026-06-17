# Task 9 — Auth Layer

The dashboard API gets its security boundary. This task adds local user accounts with Argon2id password hashing, server-side session cookies, CSRF token protection, and role-aware context — completing Milestone 1.

For the conceptual background see [README.md §6 Concept Deep-Dives](README.md#6-concept-deep-dives) (Argon2id, session cookies, CSRF). Builds on the API from Tasks 6–8 and the schema from Task 5.

## Goal

> Local user accounts with sessions, CSRF, and role checks.
>
> Done when `POST /auth/setup` → `POST /auth/login` → `POST /api/projects` (with `X-CSRF-Token`) → `POST /auth/logout` works via curl. A `POST /api/projects` without the CSRF header returns 403.

| Endpoint | Auth required | Notes |
|----------|---------------|-------|
| `POST /auth/setup` | none | Rejects (409) if any user exists |
| `POST /auth/login` | none | Sets cookie; returns CSRF token in body |
| `POST /auth/logout` | session cookie | Deletes session; clears cookie |
| `GET /me` | session cookie | Returns current user |
| `GET /api/*` | session cookie | No CSRF (safe method) |
| `POST/DELETE /api/*` | session cookie + X-CSRF-Token | 403 without valid token |

## Why this task exists

Tasks 1–8 left every `/api/*` route wide open — anyone who could reach the server could create projects and revoke keys. This task closes that gap with the minimum auth surface needed for a human to safely operate Watch.

The ingestion endpoint (`POST /ingest/{key}`) is intentionally **not** behind session auth. It uses ingestion keys, a separate security boundary.

## New migration: `0002_sessions.up.sql`

```sql
CREATE TABLE sessions (
  id         text PRIMARY KEY,   -- crypto/rand 32-byte hex token
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  csrf_token text NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

`id` is `text` rather than `uuid` because we generate it in Go as a hex string rather than letting Postgres generate a UUID. `csrf_token` lives next to the session so one DB lookup gives both facts the middleware needs.

## Package `internal/auth`

Two files; no DB access. Pure crypto.

### `passwords.go`

```go
func HashPassword(plain string) (string, error)
func VerifyPassword(plain, encoded string) (bool, error)
```

Argon2id PHC-format strings: `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`.

Parameters: 64 MB memory, 3 iterations, 4 threads, 32-byte key. Each hash takes ~100ms on modest hardware — brute-force at scale is not economical.

`VerifyPassword` parses the stored string, re-hashes the submitted password with the same parameters and salt, then uses `crypto/subtle.ConstantTimeCompare` to prevent timing attacks.

### `tokens.go`

```go
func NewToken(byteLen int) (string, error)
```

`crypto/rand` → hex encode. `NewToken(32)` → 64 hex chars → 256 bits of entropy. Used for both session IDs and CSRF tokens.

## `store/users.go`

```go
type User struct {
    ID           string  `json:"id"`
    Email        string  `json:"email"`
    DisplayName  *string `json:"display_name"`
    Role         string  `json:"role"`
    CreatedAt    string  `json:"created_at"`
    PasswordHash string  `json:"-"` // never serialized
}

func (s *Store) CountUsers(ctx) (int, error)
func (s *Store) CreateUser(ctx, orgID, email, passwordHash, role string) (User, error)
func (s *Store) GetUserByEmail(ctx, email string) (User, error)
func (s *Store) GetUserByID(ctx, id string) (User, error)
func (s *Store) DefaultOrganizationID(ctx) (string, error)
```

`PasswordHash` carries `json:"-"` so it is excluded from every JSON response without needing a separate DTO. The value is populated by `GetUserByEmail` / `GetUserByID` for internal use (password verification in the login handler) but never reaches the wire.

`DefaultOrganizationID` wraps the unexported `defaultOrganizationID(ctx, querier)` helper from `projects.go` — it gets-or-creates the single default org. The setup handler may run before any project has been created, so the org bridge must be accessible from here too.

## `store/sessions.go`

```go
type Session struct {
    ID        string
    UserID    string
    ExpiresAt time.Time
    CSRFToken string
}

func (s *Store) CreateSession(ctx, id, userID, csrfToken string, expiresAt time.Time) (Session, error)
func (s *Store) LookupSession(ctx, id string) (Session, error)  // ErrNotFound if expired
func (s *Store) DeleteSession(ctx, id string) error
```

`LookupSession` filters `expires_at > now()` in SQL so expired sessions are invisible without needing a background cleanup job. Deleting them (retention cleanup) is future work.

## `api/middleware.go` (update)

Adds two context keys to the existing `ctxKey` const block:

```go
const (
    requestIDKey ctxKey = iota // 0 — pre-existing
    sessionKey                 // 1
    userKey                    // 2
)
```

## `api/authmiddleware.go`

Two middleware functions and two context accessors.

### `sessionRequired`

Method on `*API` (needs the store). Reads the `watch_session` cookie → `store.LookupSession` → `store.GetUserByID` → stores both in context. Returns 401 on any failure. Must run before `csrfProtected`.

### `csrfProtected`

Method on `*API` (for consistency; no store access needed). On non-GET/HEAD/OPTIONS requests, reads `X-CSRF-Token` header and compares it with `sess.CSRFToken` from context. Returns 403 on mismatch.

### Context helpers

```go
func SessionFromContext(ctx) (store.Session, bool)
func UserFromContext(ctx) (store.User, bool)
```

## `api/auth.go` (handlers)

### `handleAuthSetup`

1. Decode `{email, password}`.
2. `store.CountUsers` → 409 if > 0.
3. `auth.HashPassword(password)`.
4. `store.DefaultOrganizationID` → get/create default org.
5. `store.CreateUser(orgID, email, hash, "owner")` → 201.

### `handleLogin`

1. Decode `{email, password}`.
2. `store.GetUserByEmail` → 401 with vague message if not found.
3. `auth.VerifyPassword` → 401 with same vague message if mismatch.
4. `auth.NewToken(32)` × 2 → session ID + CSRF token.
5. `store.CreateSession(id, user.ID, csrfToken, now+24h)`.
6. `http.SetCookie` with `watch_session`; `Secure: r.TLS != nil` (false over plain HTTP so local curl works).
7. Return `{user, csrf_token}`.

Using a deliberately vague error message ("invalid email or password") for both bad-email and bad-password cases prevents an attacker from enumerating which emails are registered.

### `handleLogout`

Reads session from context (put there by `sessionRequired`) → `store.DeleteSession` → clear cookie with `MaxAge: -1` → 204.

### `handleMe`

Reads user from context → `writeJSON(200, user)`.

## `api/api.go` — updated routing

The `/api/*` routes move to a sub-mux so a single middleware chain wraps all of them:

```go
// Public
mux.HandleFunc("GET /health", a.handleHealth)
mux.HandleFunc("POST /ingest/{key}", a.handleIngest)
mux.HandleFunc("POST /auth/setup", a.handleAuthSetup)
mux.HandleFunc("POST /auth/login", a.handleLogin)

// Session-only (no CSRF)
mux.Handle("POST /auth/logout", a.sessionRequired(http.HandlerFunc(a.handleLogout)))
mux.Handle("GET /me",           a.sessionRequired(http.HandlerFunc(a.handleMe)))

// Session + CSRF
apiMux := http.NewServeMux()
apiMux.HandleFunc("POST /api/projects", ...)
// ... all existing CRUD routes ...
mux.Handle("/api/", a.sessionRequired(a.csrfProtected(apiMux)))
```

The key insight: `/api/` as a subtree pattern on the outer mux catches all `/api/*` requests and passes them to the protected inner mux. No `/api/` routes are registered on the outer mux directly, so none bypass the middleware.

## Verification

```bash
# Start the stack and server (fresh DB so CountUsers returns 0)
docker compose -f deploy/docker-compose.yml up -d
cd apps/server && go run ./cmd/watch

JAR=$(mktemp /tmp/cookies.XXXXXX)

# 1. Setup — create the first owner
curl -s -c "$JAR" -X POST http://localhost:8080/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"supersecret123"}' | jq .
# Expect: {"id":"...","email":"admin@example.com","role":"owner",...}

# Running setup again should return 409
curl -s -X POST http://localhost:8080/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"other@example.com","password":"pass"}' | jq .
# Expect: {"error":"setup already completed"}

# 2. Login — get session cookie and CSRF token
RESP=$(curl -s -c "$JAR" -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"supersecret123"}')
echo "$RESP" | jq .
CSRF=$(echo "$RESP" | jq -r '.csrf_token')
# Expect: {"user":{...},"csrf_token":"..."}

# 3. Create project (authenticated + CSRF)
curl -s -b "$JAR" -X POST http://localhost:8080/api/projects \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"My App"}' | jq .
# Expect: project with environments and keys

# 4. Mutation without CSRF → 403
curl -s -b "$JAR" -X POST http://localhost:8080/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Should fail"}' | jq .
# Expect: {"error":"invalid CSRF token"}

# 5. GET without CSRF → allowed (safe method)
curl -s -b "$JAR" http://localhost:8080/api/projects | jq .
# Expect: {"projects":[...]}

# 6. /me
curl -s -b "$JAR" http://localhost:8080/me | jq .
# Expect: {"id":"...","email":"admin@example.com","role":"owner",...}

# 7. Logout
curl -s -b "$JAR" -c "$JAR" -X POST http://localhost:8080/auth/logout
# Expect: 204

# 8. After logout, /api/* returns 401
curl -s -b "$JAR" http://localhost:8080/api/projects | jq .
# Expect: {"error":"authentication required"}
```

## Common gotchas

- **`Secure` cookie in local dev** — the session cookie is set with `Secure: r.TLS != nil`. Over plain HTTP this is `false`, so curl and browsers send it. In production (HTTPS), it flips to `true` automatically.
- **Email case sensitivity** — the login and setup handlers call `strings.ToLower` on the submitted email before looking it up. The DB stores whatever case was used at setup time; if you register `Admin@example.com` and login with `admin@example.com`, the lookup will fail. For M1, document that emails are stored lower-cased (both handlers lowercase before insert/lookup).
- **Sub-mux path matching** — `mux.Handle("/api/", ...)` is a trailing-slash subtree pattern. The inner apiMux must have the full paths (e.g. `POST /api/projects`), not stripped paths. Go's `http.ServeMux` does not strip the prefix when handing off to the inner mux.
- **Session not in context on logout** — `handleLogout` reads the session from context set by `sessionRequired`. If `sessionRequired` short-circuits (e.g. cookie valid but user deleted), logout won't have a session ID. The handler gracefully handles the zero-value session ID (deleting by an empty string is a no-op).

## What this task does NOT do

- **OIDC / trusted-header auth** — see [docs/auth-model.md](../auth-model.md); those providers are explicit non-goals of v1.
- **Role gating per route** — the `role` field is stored and returned, but mutating endpoints don't yet enforce minimum roles. That arrives when the dashboard needs differentiated permissions.
- **Session expiry cleanup** — expired sessions stay in the DB until manually deleted. A background worker (M5) can sweep them periodically.
- **Password reset / change** — out of scope for M1; the operator can directly update the DB if needed.

---

**M1 is now complete.** M2 (Browser SDK Core) can begin: `POST /ingest/{key}` accepts events, `/auth/login` secures the dashboard, and the schema accommodates all future milestones.
