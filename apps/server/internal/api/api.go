// Package api holds the HTTP handlers for watch — the ingestion API and the
// dashboard API. It builds the router the server serves.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

// API wires the HTTP handlers to their dependencies.
type API struct {
	store *store.Store
}

// new returns an API backed by the given store.
func New(st *store.Store) *API {
	return &API{store: st}
}

// Handler builds the router for the whole HTTP surface, wrapped in the
// middleware chain. Order (outer → inner): requestID tags the request and
// context; requestLogger times and logs it; recoverer turns panics into a
// logged 500 captured by the logger.
//
// Route groups:
//   - Public:              GET /health, POST /ingest/{key}, POST /auth/setup, POST /auth/login
//   - Session-only:        POST /auth/logout, GET /me
//   - Session + CSRF:      /api/* subtree (all dashboard CRUD)
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()

	// Public routes — no authentication required.
	mux.HandleFunc("GET /health", a.handleHealth)
	mux.HandleFunc("POST /ingest/{key}", a.handleIngest)
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
		slog.ErrorContext(r.Context(), "health check: database unreachable",
			"error", err, "request_id", RequestIDFromContext(r.Context()))
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
	slog.ErrorContext(r.Context(), clientMsg,
		"error", err, "request_id", RequestIDFromContext(r.Context()))
	writeError(w, http.StatusInternalServerError, clientMsg)
}
