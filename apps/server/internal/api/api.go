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

// new returns an API backed by the given store.
func New(st *store.Store) *API {
	return &API{store: st}
}

// Handler builds the router for the whole HTTP surface.
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
