package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Session mirrors the sessions table row.
type Session struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	CSRFToken string
}

// CreateSession inserts a new session row and returns it.
func (s *Store) CreateSession(ctx context.Context, id, userID, csrfToken string, expiresAt time.Time) (Session, error) {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sessions (id, user_id, csrf_token, expires_at)
		VALUES ($1, $2::uuid, $3, $4)
	`, id, userID, csrfToken, expiresAt)
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return Session{
		ID:        id,
		UserID:    userID,
		CSRFToken: csrfToken,
		ExpiresAt: expiresAt,
	}, nil
}

// LookupSession fetches a session by its ID and verifies it hasn't expired.
// Returns ErrNotFound when the session is missing or expired.
func (s *Store) LookupSession(ctx context.Context, id string) (Session, error) {
	var sess Session
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id::text, csrf_token, expires_at
		FROM sessions
		WHERE id = $1 AND expires_at > now()
	`, id).Scan(&sess.ID, &sess.UserID, &sess.CSRFToken, &sess.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("lookup session: %w", err)
	}
	return sess, nil
}

// DeleteSession removes a session by its ID. A missing session is not an error.
func (s *Store) DeleteSession(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
