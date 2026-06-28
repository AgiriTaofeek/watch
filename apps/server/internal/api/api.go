// Package api holds the HTTP handlers for watch — the ingestion API and the
// dashboard API. It builds the router the server serves.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

var uuidRe = regexp.MustCompile(
	`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`,
)

// validUUID reports whether s is a well-formed UUID. Used to pre-validate
// query-param IDs before they reach a Postgres ::uuid cast.
func validUUID(s string) bool { return uuidRe.MatchString(s) }

// Store is the database behavior the HTTP layer needs. The concrete
// *store.Store satisfies this interface; tests use a small fake so handler
// behavior can be exercised without a Postgres process.
type Store interface {
	Ping(ctx context.Context) error
	LookupIngestionKey(ctx context.Context, publicKey string) (store.KeyLookup, error)
	InsertRawEvent(ctx context.Context, e store.RawEvent) error
	IncrementDroppedCounter(ctx context.Context, environmentID *string, reason string, day time.Time) error
	CreateFirstOwner(ctx context.Context, email, passwordHash string) (store.User, error)
	GetUserByEmail(ctx context.Context, email string) (store.User, error)
	GetUserByID(ctx context.Context, id string) (store.User, error)
	CreateSession(ctx context.Context, id, userID, csrfToken string, expiresAt time.Time) (store.Session, error)
	LookupSession(ctx context.Context, id string) (store.Session, error)
	DeleteSession(ctx context.Context, id string) error
	CreateProject(ctx context.Context, name string, allowedOrigins []string) (store.ProjectDetail, error)
	ListProjects(ctx context.Context) ([]store.ProjectDetail, error)
	CreateEnvironment(ctx context.Context, projectID, name string) (store.Environment, error)
	CreateIngestionKey(ctx context.Context, environmentID string) (store.IngestionKey, error)
	RevokeKey(ctx context.Context, keyID string) error

	// Issues
	ListIssues(ctx context.Context, projectID, environmentID string, status *string, limit, offset int) ([]store.Issue, int64, error)
	GetIssue(ctx context.Context, issueID string) (store.Issue, error)
	UpdateIssueStatus(ctx context.Context, issueID, status string) error

	// Rollups
	QueryErrorRollups(ctx context.Context, projectID, envID string, from, to time.Time) ([]store.ErrorRollup, error)
	QueryVitalRollups(ctx context.Context, projectID, envID, metric string, from, to time.Time) ([]store.VitalRollup, error)
	QueryRouteRollups(ctx context.Context, projectID, envID string, from, to time.Time) (*store.RouteSummaryResult, error)
	QueryNetworkRollups(ctx context.Context, projectID, envID string, from, to time.Time) ([]store.NetworkRollup, error)
	QueryNavSummary(ctx context.Context, projectID, envID string, from, to time.Time) (*store.NavSummaryResult, error)
	SystemHealthStats() store.DBStats
}

// CookieSecureMode controls the Secure attribute on dashboard auth cookies.
type CookieSecureMode string

const (
	CookieSecureAuto  CookieSecureMode = "auto"
	CookieSecureTrue  CookieSecureMode = "true"
	CookieSecureFalse CookieSecureMode = "false"
)

// Options controls behavior that differs between deployments.
type Options struct {
	CookieSecure CookieSecureMode
}

// API wires the HTTP handlers to their dependencies.
type API struct {
	store        Store
	cookieSecure CookieSecureMode
	loginLimiter *loginRateLimiter
	startTime    time.Time
}

// New returns an API backed by the given store.
func New(st Store, opts ...Options) *API {
	cfg := Options{CookieSecure: CookieSecureAuto}
	if len(opts) > 0 {
		cfg = opts[0]
	}
	if cfg.CookieSecure == "" {
		cfg.CookieSecure = CookieSecureAuto
	}
	return &API{
		store:        st,
		cookieSecure: cfg.CookieSecure,
		loginLimiter: newLoginRateLimiter(maxFailedLogins, loginLockoutWindow),
		startTime:    time.Now(),
	}
}

// Handler builds the router for the whole HTTP surface, wrapped in the
// middleware chain. Order (outer → inner): requestID tags the request and
// context; requestLogger times and logs it; recoverer turns panics into a
// logged 500 captured by the logger.
//
// Route groups:
//   - Public:              GET /health, POST/OPTIONS /ingest/{key}, POST /auth/setup, POST /auth/login
//   - Session-only:        POST /auth/logout, GET /me
//   - Session + CSRF:      /api/* subtree (all dashboard CRUD)
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()

	// Public routes — no authentication required.
	mux.HandleFunc("GET /health", a.handleHealth)
	mux.HandleFunc("POST /ingest/{key}", a.handleIngest)
	mux.HandleFunc("OPTIONS /ingest/{key}", a.handleIngestPreflight)
	mux.HandleFunc("POST /auth/setup", a.handleAuthSetup)
	mux.HandleFunc("POST /auth/login", a.handleLogin)

	// Session-required routes (no CSRF — GET or logout).
	mux.Handle("POST /auth/logout", a.sessionRequired(http.HandlerFunc(a.handleLogout)))
	mux.Handle("GET /me", a.sessionRequired(http.HandlerFunc(a.handleMe)))

	// Dashboard API — session + CSRF required on all methods.
	// Registered on a sub-mux so the middleware wraps the whole /api/ subtree.
	apiMux := http.NewServeMux()
	apiMux.HandleFunc("POST /api/projects", a.handleCreateProject)
	apiMux.HandleFunc("GET /api/projects", a.handleListProjects)
	apiMux.HandleFunc("POST /api/projects/{id}/environments", a.handleCreateEnvironment)
	apiMux.HandleFunc("POST /api/environments/{id}/keys", a.handleCreateKey)
	apiMux.HandleFunc("DELETE /api/keys/{id}", a.handleRevokeKey)

	// Issues
	apiMux.HandleFunc("GET /api/projects/{id}/issues", a.handleListIssues)
	apiMux.HandleFunc("GET /api/issues/{id}", a.handleGetIssue)
	apiMux.HandleFunc("PATCH /api/issues/{id}/status", a.handleUpdateIssueStatus)

	// Rollups
	apiMux.HandleFunc("GET /api/projects/{id}/rollups/errors", a.handleGetErrorRollups)
	apiMux.HandleFunc("GET /api/projects/{id}/rollups/vitals", a.handleGetVitalRollups)
	apiMux.HandleFunc("GET /api/projects/{id}/rollups/routes", a.handleGetRouteRollups)
	apiMux.HandleFunc("GET /api/projects/{id}/rollups/network", a.handleGetNetworkRollups)
	apiMux.HandleFunc("GET /api/projects/{id}/rollups/navigation", a.handleGetNavSummary)

	// System health — session required, no project scoping.
	apiMux.HandleFunc("GET /api/system/health", a.handleGetSystemHealth)

	mux.Handle("/api/", a.sessionRequired(a.csrfProtected(apiMux)))

	return requestID(requestLogger(recoverer(mux)))
}

// handleHealth reports process liveness and database connectivity.
// 200 = up and DB reachable; 503 = up but a dependency is degraded. The
// underlying DB error is logged, not returned, to avoid leaking internals.
func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.store.Ping(ctx); err != nil {
		LoggerFromContext(r.Context()).ErrorContext(r.Context(), "health check: database unreachable",
			"error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "degraded",
			"db":     "unreachable",
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

// serverError logs the underlying error (with the request id) and returns a
// generic message to the client. Use it for every 5xx so failures are
// debuggable from logs without leaking internals to callers.
func (a *API) serverError(w http.ResponseWriter, r *http.Request, err error, clientMsg string) {
	LoggerFromContext(r.Context()).ErrorContext(r.Context(), clientMsg, "error", err)
	writeError(w, http.StatusInternalServerError, clientMsg)
}
