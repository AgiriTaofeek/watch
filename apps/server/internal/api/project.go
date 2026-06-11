package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

func (a *API) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB
	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	project, err := a.store.CreateProject(r.Context(), req.Name)
	if err != nil {
		a.serverError(w, r, err, "could not create project")
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (a *API) handleListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.store.ListProjects(r.Context())
	if err != nil {
		a.serverError(w, r, err, "could not list projects")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (a *API) handleCreateEnvironment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB

	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
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
		a.serverError(w, r, err, "could not create environment")
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
		a.serverError(w, r, err, "could not create key")
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
		a.serverError(w, r, err, "could not revoke key")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeError sends a JSON {"error": msg } with the given status
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
