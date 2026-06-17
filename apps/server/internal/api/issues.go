package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

func (a *API) handleListIssues(w http.ResponseWriter, r *http.Request) {
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

	var status *string
	if s := q.Get("status"); s != "" {
		switch s {
		case "open", "resolved", "ignored":
			status = &s
		default:
			writeError(w, http.StatusBadRequest, "status must be one of: open, resolved, ignored")
			return
		}
	}

	limit := 50
	if l := q.Get("limit"); l != "" {
		n, err := strconv.Atoi(l)
		if err != nil || n < 1 || n > 200 {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 200")
			return
		}
		limit = n
	}

	offset := 0
	if o := q.Get("offset"); o != "" {
		n, err := strconv.Atoi(o)
		if err != nil || n < 0 {
			writeError(w, http.StatusBadRequest, "offset must be a non-negative integer")
			return
		}
		offset = n
	}

	issues, total, err := a.store.ListIssues(r.Context(), projectID, envID, status, limit, offset)
	if err != nil {
		a.serverError(w, r, err, "could not list issues")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"issues": issues,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (a *API) handleGetIssue(w http.ResponseWriter, r *http.Request) {
	issueID := r.PathValue("id")
	issue, err := a.store.GetIssue(r.Context(), issueID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}
	if err != nil {
		a.serverError(w, r, err, "could not get issue")
		return
	}
	writeJSON(w, http.StatusOK, issue)
}

func (a *API) handleUpdateIssueStatus(w http.ResponseWriter, r *http.Request) {
	issueID := r.PathValue("id")

	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	switch req.Status {
	case "open", "resolved", "ignored":
	default:
		writeError(w, http.StatusBadRequest, "status must be one of: open, resolved, ignored")
		return
	}

	err := a.store.UpdateIssueStatus(r.Context(), issueID, req.Status)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}
	if err != nil {
		a.serverError(w, r, err, "could not update issue status")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
