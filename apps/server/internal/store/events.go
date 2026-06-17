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
