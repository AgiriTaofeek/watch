package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
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

// ingestEnvelope is the strict top-level shape accepted by the ingestion API.
// Project identity is derived from the ingestion key, not trusted from JSON.
type ingestEnvelope struct {
	Environment string         `json:"environment"`
	Release     *string        `json:"release,omitempty"`
	Service     string         `json:"service"`
	Timestamp   string         `json:"timestamp"`
	Type        string         `json:"type"`
	Context     map[string]any `json:"context"`
	Payload     map[string]any `json:"payload"`
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

	if origin := r.Header.Get("Origin"); origin != "" && !originAllowed(origin, key.AllowedOrigins) {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "blocked_origin", http.StatusForbidden, "origin is not allowed")
		return
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
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&env); err != nil {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		a.dropAndRespond(ctx, w, &key.EnvironmentID, "invalid_schema", http.StatusBadRequest, "invalid JSON body")
		return
	}

	// 4. Validate required envelope fields.
	if env.Environment == "" || env.Service != "frontend" || env.Type == "" || env.Timestamp == "" || env.Context == nil || env.Payload == nil {
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

	env.Context = redactMap(env.Context)
	env.Payload = redactMap(env.Payload)
	sanitized, err := json.Marshal(env)
	if err != nil {
		a.serverError(w, r, err, "could not sanitize event")
		return
	}

	// 5. Persist the sanitized event envelope.
	if err := a.store.InsertRawEvent(ctx, store.RawEvent{
		IngestionKeyID: key.KeyID,
		EnvironmentID:  key.EnvironmentID,
		ProjectID:      key.ProjectID,
		EventType:      env.Type,
		Release:        env.Release,
		EventTimestamp: ts,
		Payload:        sanitized,
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

func originAllowed(origin string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, candidate := range allowed {
		if origin == candidate {
			return true
		}
	}
	return false
}

var sensitiveKeys = map[string]bool{
	"authorization": true,
	"cookie":        true,
	"set-cookie":    true,
	"password":      true,
	"passwd":        true,
	"secret":        true,
	"token":         true,
	"api_key":       true,
	"apikey":        true,
	"access_token":  true,
	"auth":          true,
	"x-auth-token":  true,
	"x-api-key":     true,
}

func redactMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		if isSensitiveKey(key) {
			out[key] = "[redacted]"
			continue
		}
		out[key] = redactValue(value)
	}
	return out
}

func redactValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		return redactMap(v)
	case []any:
		out := make([]any, len(v))
		for i := range v {
			out[i] = redactValue(v[i])
		}
		return out
	case string:
		return redactURLQuery(v)
	default:
		return v
	}
}

func redactURLQuery(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.RawQuery == "" {
		return raw
	}
	q := u.Query()
	changed := false
	for key := range q {
		if isSensitiveKey(key) {
			q.Set(key, "[redacted]")
			changed = true
		}
	}
	if !changed {
		return raw
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func isSensitiveKey(key string) bool {
	key = strings.ToLower(key)
	if sensitiveKeys[key] {
		return true
	}
	return strings.Contains(key, "token") ||
		strings.Contains(key, "password") ||
		strings.Contains(key, "passwd") ||
		strings.Contains(key, "secret") ||
		strings.Contains(key, "api_key") ||
		strings.Contains(key, "apikey") ||
		strings.Contains(key, "authorization") ||
		strings.Contains(key, "cookie")
}
