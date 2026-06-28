package api

import (
	"net/http"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

func (a *API) handleGetRouteRollups(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if !validUUID(projectID) {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	q := r.URL.Query()
	envID := q.Get("environment_id")
	if !validUUID(envID) {
		writeError(w, http.StatusBadRequest, "environment_id query param is required and must be a UUID")
		return
	}
	from, to, ok := parseTimeRange(w, q)
	if !ok {
		return
	}

	result, err := a.store.QueryRouteRollups(r.Context(), projectID, envID, from, to)
	if err != nil {
		a.serverError(w, r, err, "could not query route rollups")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) handleGetNetworkRollups(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if !validUUID(projectID) {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	q := r.URL.Query()
	envID := q.Get("environment_id")
	if !validUUID(envID) {
		writeError(w, http.StatusBadRequest, "environment_id query param is required and must be a UUID")
		return
	}
	from, to, ok := parseTimeRange(w, q)
	if !ok {
		return
	}

	failures, err := a.store.QueryNetworkRollups(r.Context(), projectID, envID, from, to)
	if err != nil {
		a.serverError(w, r, err, "could not query network rollups")
		return
	}
	if failures == nil {
		failures = []store.NetworkRollup{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"failed_requests": failures})
}

func (a *API) handleGetNavSummary(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if !validUUID(projectID) {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	q := r.URL.Query()
	envID := q.Get("environment_id")
	if !validUUID(envID) {
		writeError(w, http.StatusBadRequest, "environment_id query param is required and must be a UUID")
		return
	}
	from, to, ok := parseTimeRange(w, q)
	if !ok {
		return
	}

	result, err := a.store.QueryNavSummary(r.Context(), projectID, envID, from, to)
	if err != nil {
		a.serverError(w, r, err, "could not query navigation summary")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
