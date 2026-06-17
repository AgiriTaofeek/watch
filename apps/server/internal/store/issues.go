package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Issue is a grouped set of frontend_error events that share the same
// fingerprint (error name + normalized message + route).
type Issue struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"project_id"`
	EnvironmentID string  `json:"environment_id"`
	Fingerprint   string  `json:"fingerprint"`
	Title         string  `json:"title"`
	Culprit       *string `json:"culprit"`
	Status        string  `json:"status"` // 'open' | 'resolved' | 'ignored'
	FirstSeenAt   string  `json:"first_seen_at"`
	LastSeenAt    string  `json:"last_seen_at"`
	EventCount    int64   `json:"event_count"`
	UserCount     int64   `json:"user_count"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

// UpsertIssueParams carries the data needed to create or update an issue row.
type UpsertIssueParams struct {
	ProjectID     string
	EnvironmentID string
	Fingerprint   string
	Title         string
	Culprit       string  // route pattern; empty string when unknown
	LastSeenAt    time.Time
	UserIDHash    *string // non-nil increments user_count
}

// UpsertIssue inserts a new issue or, on fingerprint conflict, updates the
// occurrence counters and last_seen_at. A resolved issue is re-opened when a
// new event arrives — regressions should be visible. Returns the issue ID.
func (s *Store) UpsertIssue(ctx context.Context, p UpsertIssueParams) (string, error) {
	var culprit *string
	if p.Culprit != "" {
		culprit = &p.Culprit
	}
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO issues
		    (project_id, environment_id, fingerprint, title, culprit, last_seen_at,
		     first_seen_at, event_count, user_count)
		VALUES
		    ($1::uuid, $2::uuid, $3, $4, $5, $6,
		     $6, 1,
		     CASE WHEN $7::text IS NOT NULL THEN 1 ELSE 0 END)
		ON CONFLICT (project_id, environment_id, fingerprint) DO UPDATE SET
		    last_seen_at = EXCLUDED.last_seen_at,
		    event_count  = issues.event_count + 1,
		    user_count   = issues.user_count + CASE WHEN $7::text IS NOT NULL THEN 1 ELSE 0 END,
		    -- Re-open a resolved issue when a new occurrence arrives.
		    status       = CASE WHEN issues.status = 'resolved' THEN 'open' ELSE issues.status END,
		    updated_at   = now()
		RETURNING id::text
	`, p.ProjectID, p.EnvironmentID, p.Fingerprint, p.Title, culprit, p.LastSeenAt, p.UserIDHash).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("upsert issue: %w", err)
	}
	return id, nil
}

// ListIssues returns issues for a project/environment, sorted by last_seen_at
// descending. Pass a non-nil status to filter to one lifecycle state.
func (s *Store) ListIssues(
	ctx context.Context,
	projectID, environmentID string,
	status *string,
	limit, offset int,
) ([]Issue, int64, error) {
	// Count total matching rows for pagination.
	var total int64
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM issues
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND ($3::text IS NULL OR status = $3::issue_status)
	`, projectID, environmentID, status).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count issues: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id::text, project_id::text, environment_id::text, fingerprint,
		       title, culprit, status::text,
		       first_seen_at::text, last_seen_at::text,
		       event_count, user_count,
		       created_at::text, updated_at::text
		FROM issues
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND ($3::text IS NULL OR status = $3::issue_status)
		ORDER BY last_seen_at DESC
		LIMIT $4 OFFSET $5
	`, projectID, environmentID, status, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list issues: %w", err)
	}
	issues, err := pgx.CollectRows(rows, scanIssue)
	if err != nil {
		return nil, 0, err
	}
	return issues, total, nil
}

// GetIssue returns a single issue by ID. Returns ErrNotFound when no row matches.
func (s *Store) GetIssue(ctx context.Context, issueID string) (Issue, error) {
	if !validUUID(issueID) {
		return Issue{}, ErrNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, project_id::text, environment_id::text, fingerprint,
		       title, culprit, status::text,
		       first_seen_at::text, last_seen_at::text,
		       event_count, user_count,
		       created_at::text, updated_at::text
		FROM issues
		WHERE id = $1::uuid
	`, issueID)
	if err != nil {
		return Issue{}, fmt.Errorf("get issue: %w", err)
	}
	issue, err := pgx.CollectExactlyOneRow(rows, scanIssue)
	if errors.Is(err, pgx.ErrNoRows) {
		return Issue{}, ErrNotFound
	}
	if err != nil {
		return Issue{}, fmt.Errorf("get issue: %w", err)
	}
	return issue, nil
}

// UpdateIssueStatus sets the status of an issue. status must be one of
// 'open', 'resolved', 'ignored'. Returns ErrNotFound when no row matched.
func (s *Store) UpdateIssueStatus(ctx context.Context, issueID, status string) error {
	if !validUUID(issueID) {
		return ErrNotFound
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE issues SET status = $2::issue_status, updated_at = now()
		WHERE id = $1::uuid
	`, issueID, status)
	if err != nil {
		return fmt.Errorf("update issue status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func scanIssue(r pgx.CollectableRow) (Issue, error) {
	var i Issue
	return i, r.Scan(
		&i.ID, &i.ProjectID, &i.EnvironmentID, &i.Fingerprint,
		&i.Title, &i.Culprit, &i.Status,
		&i.FirstSeenAt, &i.LastSeenAt,
		&i.EventCount, &i.UserCount,
		&i.CreatedAt, &i.UpdatedAt,
	)
}
