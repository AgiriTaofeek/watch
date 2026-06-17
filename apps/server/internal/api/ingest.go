package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

const maxIngestBodyBytes = 100 * 1024 // 100 KB

var validEventTypes = map[string]bool{
	"web_vital":       true,
	"frontend_error":  true,
	"network_request": true,
	"navigation":      true,
	"asset_load":      true,
	"breadcrumb":      true,
	"deployment":      true,
}

// ingestEnvelope holds only the envelope fields needed for validation and
// storage. The raw body is stored verbatim so no fields are lost.
type ingestEnvelope struct {
	Service   string  `json:"service"`
	Timestamp string  `json:"timestamp"`
	Type      string  `json:"type"`
	Release   *string `json:"release"`
}

func (a *API) handleIngest(w http.ResponseWriter, r *http.Request) {
	publicKey := r.PathValue("key")
	ctx := r.Context()

	// 1. Look up the ingestion key so we have environment_id for counters.
	key, err := a.store.LookupIngestionKey(ctx, publicKey)
	if errors.Is(err, store.ErrNotFound) {
		a.dropAndRespond(ctx, w, nil, "unknown_key", http.StatusUnauthorized, "unknown ingestion key")
		return
	}
	if err != nil {
		a.serverError(w, r, err, "could not look up ingestion key")
		return
	}
	if key.RevokedAt != nil {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "revoked_key", http.StatusUnauthorized, "ingestion key has been revoked")
		return
	}

	// Origin check: the allowed-origins column on projects is deferred to a
	// later migration. For now, log the origin for observability only.
	if origin := r.Header.Get("Origin"); origin != "" {
		slog.DebugContext(ctx, "ingest request origin",
			"origin", origin,
			"key_id", key.KeyID,
			"request_id", RequestIDFromContext(ctx),
		)
	}

	// 2. Read body with size guard.
	body, err := io.ReadAll(io.LimitReader(r.Body, maxIngestBodyBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read body")
		return
	}
	if len(body) > maxIngestBodyBytes {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "oversized_payload", http.StatusRequestEntityTooLarge, "payload too large")
		return
	}

	// 3. Decode the envelope.
	var env ingestEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "invalid JSON body")
		return
	}

	// 4. Validate required envelope fields.
	if env.Service != "frontend" || env.Type == "" || env.Timestamp == "" {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "missing required envelope fields")
		return
	}
	if !validEventTypes[env.Type] {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "unknown event type")
		return
	}
	ts, err := time.Parse(time.RFC3339, env.Timestamp)
	if err != nil {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "timestamp must be RFC3339")
		return
	}

	// 5. Persist the raw event. The full body is stored verbatim as payload.
	if err := a.store.InsertRawEvent(ctx, store.RawEvent{
		IngestionKeyID: key.KeyID,
		EnvironmentID:  key.EnvironmentID,
		ProjectID:      key.ProjectID,
		EventType:      env.Type,
		Release:        env.Release,
		EventTimestamp: ts,
		Payload:        body,
	}); err != nil {
		a.serverError(w, r, err, "could not store event")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// dropAndRespond increments the dropped-event counter for the given reason and
// writes the HTTP error. Counter failures are logged but do not change the
// response — the SDK always gets the intended status code.
func (a *API) dropAndRespond(ctx context.Context, w http.ResponseWriter, environmentID *string, reason string, status int, msg string) {
	day := time.Now().UTC()
	if err := a.store.IncrementDroppedCounter(ctx, environmentID, reason, day); err != nil {
		slog.ErrorContext(ctx, "failed to increment dropped counter",
			"error", err,
			"reason", reason,
			"request_id", RequestIDFromContext(ctx),
		)
	}
	writeError(w, status, msg)
}
