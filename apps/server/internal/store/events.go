package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// KeyLookup holds the minimal data the ingest handler needs from an ingestion
// key row. IDs are strings cast at the SQL boundary (same pattern as projects.go).
type KeyLookup struct {
	KeyID          string
	EnvironmentID  string
	ProjectID      string
	AllowedOrigins []string
	RevokedAt      *string // nil while active; non-nil means revoked
}

// LookupIngestionKey fetches a key and its resolved environment/project IDs by
// public key value. Returns ErrNotFound when no row matches.
func (s *Store) LookupIngestionKey(ctx context.Context, publicKey string) (KeyLookup, error) {
	var k KeyLookup
	err := s.pool.QueryRow(ctx, `
		SELECT ik.id::text, ik.environment_id::text, e.project_id::text, p.allowed_origins, ik.revoked_at::text
		FROM ingestion_keys ik
		JOIN environments e ON e.id = ik.environment_id
		JOIN projects p ON p.id = e.project_id
		WHERE ik.public_key = $1
	`, publicKey).Scan(&k.KeyID, &k.EnvironmentID, &k.ProjectID, &k.AllowedOrigins, &k.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return KeyLookup{}, ErrNotFound
	}
	if err != nil {
		return KeyLookup{}, fmt.Errorf("lookup ingestion key: %w", err)
	}
	return k, nil
}

// RawEvent is the data assembled by the ingest handler before persisting.
type RawEvent struct {
	IngestionKeyID string
	EnvironmentID  string
	ProjectID      string
	EventType      string
	Release        *string
	EventTimestamp time.Time
	Payload        []byte // sanitized envelope JSON
}

// UnprocessedError is a frontend_error raw event the worker hasn't yet
// classified into an issue (issue_id IS NULL). Fields are extracted from the
// JSONB payload by the store query so the worker receives plain Go values.
type UnprocessedError struct {
	EventID        string
	ProjectID      string
	EnvironmentID  string
	Release        *string
	EventTimestamp time.Time
	Name           string  // payload->'payload'->>'name'
	Message        string  // payload->'payload'->>'message'
	Route          string  // payload->'context'->>'route' (empty when not set)
	UserIDHash     *string // payload->'context'->>'user_id_hash' (nil when not collected)
}

// FetchUnprocessedErrors returns up to limit frontend_error events that have
// not yet been linked to an issue (issue_id IS NULL). The worker calls this
// every 30 s to classify new arrivals.
func (s *Store) FetchUnprocessedErrors(ctx context.Context, limit int) ([]UnprocessedError, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
		    id::text,
		    project_id::text,
		    environment_id::text,
		    release,
		    event_timestamp,
		    COALESCE(payload->'payload'->>'name',    '') AS name,
		    COALESCE(payload->'payload'->>'message', '') AS message,
		    COALESCE(payload->'context'->>'route',   '') AS route,
		    payload->'context'->>'user_id_hash'          AS user_id_hash
		FROM raw_events
		WHERE event_type = 'frontend_error'
		  AND issue_id IS NULL
		ORDER BY received_at
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("fetch unprocessed errors: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (UnprocessedError, error) {
		var e UnprocessedError
		return e, r.Scan(
			&e.EventID, &e.ProjectID, &e.EnvironmentID, &e.Release,
			&e.EventTimestamp, &e.Name, &e.Message, &e.Route, &e.UserIDHash,
		)
	})
	return out, err
}

// AssignIssue sets the issue_id on a raw_event row, marking it as classified.
func (s *Store) AssignIssue(ctx context.Context, eventID, issueID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE raw_events SET issue_id = $2::uuid WHERE id = $1::uuid
	`, eventID, issueID)
	if err != nil {
		return fmt.Errorf("assign issue: %w", err)
	}
	return nil
}

// DeleteExpiredEvents removes raw_events whose received_at is older than before.
// Returns the number of rows deleted.
func (s *Store) DeleteExpiredEvents(ctx context.Context, before time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM raw_events WHERE received_at < $1
	`, before)
	if err != nil {
		return 0, fmt.Errorf("delete expired events: %w", err)
	}
	return tag.RowsAffected(), nil
}

// InsertRawEvent persists a single accepted event into raw_events.
func (s *Store) InsertRawEvent(ctx context.Context, e RawEvent) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO raw_events
		    (ingestion_key_id, environment_id, project_id, event_type, release, event_timestamp, payload)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::event_type, $5, $6, $7::jsonb)
	`, e.IngestionKeyID, e.EnvironmentID, e.ProjectID, e.EventType, e.Release, e.EventTimestamp, e.Payload)
	if err != nil {
		return fmt.Errorf("insert raw event: %w", err)
	}
	return nil
}
