package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ErrNotFound is returned when a referenced parent row (project, environment)
// doesn't exist. Handlers map it to HTTP 404
var ErrNotFound = errors.New("not found")

// Project, Environment, and IngestionKey mirror their rows. IDs and timestamps
// are strings (we cast uuid/timestamptz to text in queries) to stay free of
// extra dependencies.
type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedAt string `json:"created_at"`
}

type Environment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

type IngestionKey struct {
	ID        string  `json:"id"`
	PublicKey string  `json:"public_key"`
	CreatedAt string  `json:"created_at"`
	RevokedAt *string `json:"revoked_at"` // nil while active
}

// ProjectDetail is a project with its environments, each with its keys -
// the shape GET /api/projects returns.
type ProjectDetail struct {
	Project
	Environments []EnvironmentDetail `json:"environments"`
}

type EnvironmentDetail struct {
	Environment
	Keys []IngestionKey `json:"keys"`
}

// CreateProject creates a project plus a default "production" environment and an initial ingestion key, atomically. Returns the project with that env+key

func (s *Store) CreateProject(ctx context.Context, name string) (ProjectDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProjectDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful commit

	orgID, err := defaultOrganizationID(ctx, tx)

	if err != nil {
		return ProjectDetail{}, err
	}

	var p Project
	err = tx.QueryRow(ctx, `
			INSERT INTO projects (organization_id, name, slug)
	    VALUES ($1::uuid, $2, $3)
	    RETURNING id::text, name, slug, created_at::text
	`,
		orgID, name, slugify(name)).Scan(&p.ID, &p.Name, &p.Slug, &p.CreatedAt)

	if err != nil {
		return ProjectDetail{}, fmt.Errorf("insert project: %w", err)
	}

	env, err := insertEnvironment(ctx, tx, p.ID, "production")
	if err != nil {
		return ProjectDetail{}, err
	}
	key, err := insertIngestionKey(ctx, tx, env.ID)
	if err != nil {
		return ProjectDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ProjectDetail{}, fmt.Errorf("commit: %w", err)
	}

	return ProjectDetail{
		Project:      p,
		Environments: []EnvironmentDetail{{Environment: env, Keys: []IngestionKey{key}}},
	}, nil
}

// ListProjects returns every project with its environments and keys. Three flat
// queries grouped in Go, rather than N+1 per-project lookups.
func (s *Store) ListProjects(ctx context.Context) ([]ProjectDetail, error) {
	projRows, err := s.pool.Query(ctx, `
			SELECT id::text, name, slug, created_at::text
			FROM projects
			ORDER BY created_at
	`)

	if err != nil {
		return nil, fmt.Errorf("query projects: %w", err)
	}
	projects, err := pgx.CollectRows(projRows, func(r pgx.CollectableRow) (ProjectDetail, error) {
		var p ProjectDetail
		return p, r.Scan(&p.ID, &p.Name, &p.Slug, &p.CreatedAt)
	})

	if err != nil {
		return nil, err
	}

	// Index environments by project id, and prepare to attach keys by env id.
	envByProject := map[string][]EnvironmentDetail{}
	envIndex := map[string]*EnvironmentDetail{} // env id -> pointer into the slices below
	envRows, err := s.pool.Query(ctx, `
	  	SELECT id::text, project_id::text, name, created_at::text
			FROM environments
			ORDER BY created_at
	`)

	if err != nil {
		return nil, fmt.Errorf("query environments: %w", err)
	}
	defer envRows.Close()
	for envRows.Next() {
		var e EnvironmentDetail
		var projectID string
		if err := envRows.Scan(&e.ID, &projectID, &e.Name, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Keys = []IngestionKey{}
		envByProject[projectID] = append(envByProject[projectID], e)
	}
	if err := envRows.Err(); err != nil {
		return nil, err
	}
	// Build the env-id index after slices are stable.
	for pid := range envByProject {
		for i := range envByProject[pid] {
			envIndex[envByProject[pid][i].ID] = &envByProject[pid][i]
		}
	}

	keyRows, err := s.pool.Query(ctx, `
			SELECT id::text, environment_id::text, public_key, created_at::text, revoked_at::text
		  FROM ingestion_keys ORDER BY created_at
	`)
	if err != nil {
		return nil, fmt.Errorf("query keys: %w", err)
	}
	defer keyRows.Close()
	for keyRows.Next() {
		var k IngestionKey
		var envID string
		if err := keyRows.Scan(&k.ID, &envID, &k.PublicKey, &k.CreatedAt, &k.RevokedAt); err != nil {
			return nil, err
		}
		if e := envIndex[envID]; e != nil {
			e.Keys = append(e.Keys, k)
		}
	}
	if err := keyRows.Err(); err != nil {
		return nil, err
	}

	for i := range projects {
		projects[i].Environments = envByProject[projects[i].ID]
		if projects[i].Environments == nil {
			projects[i].Environments = []EnvironmentDetail{}
		}
	}
	return projects, nil
}

// CreateEnvironment adds an environment to an existing project.
func (s *Store) CreateEnvironment(ctx context.Context, projectID, name string) (Environment, error) {
	ok, err := s.exists(ctx, "projects", projectID)
	if err != nil {
		return Environment{}, err
	}
	if !ok {
		return Environment{}, ErrNotFound
	}
	return insertEnvironment(ctx, s.pool, projectID, name)
}

// CreateIngestionKey mints a new key on an existing environment.
func (s *Store) CreateIngestionKey(ctx context.Context, environmentID string) (IngestionKey, error) {
	ok, err := s.exists(ctx, "environments", environmentID)
	if err != nil {
		return IngestionKey{}, err
	}
	if !ok {
		return IngestionKey{}, ErrNotFound
	}
	return insertIngestionKey(ctx, s.pool, environmentID)
}

// RevokeKey soft-revokes a key. Returns ErrNotFound if no active key matched.
func (s *Store) RevokeKey(ctx context.Context, keyID string) error {
	if !validUUID(keyID) {
		return ErrNotFound
	}
	tag, err := s.pool.Exec(ctx, `
			UPDATE ingestion_keys SET revoked_at = now()
		  WHERE id = $1::uuid AND revoked_at IS NULL
	`,
		keyID)
	if err != nil {
		return fmt.Errorf("revoke key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- helpers ---

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so insert helpers
// work inside or outside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func defaultOrganizationID(ctx context.Context, q querier) (string, error) {
	var id string
	err := q.QueryRow(ctx, `
	    SELECT id::text
			FROM organizations
			ORDER BY created_at
			LIMIT 1
	`).Scan(&id)

	if err == nil {
		return id, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("select org: %w", err)
	}
	// None yet — create the single default org (v1 is single-organization).
	err = q.QueryRow(ctx, `
			INSERT INTO organizations (name)
			VALUES ('Watch')
			RETURNING id::text
	`).Scan(&id)

	if err != nil {
		return "", fmt.Errorf("create default org: %w", err)
	}
	return id, nil
}

func insertEnvironment(ctx context.Context, q querier, projectID, name string) (Environment, error) {
	var e Environment
	err := q.QueryRow(ctx, `
			INSERT INTO environments (project_id, name)
			VALUES ($1::uuid, $2)
		  RETURNING id::text, name, created_at::text
	`,
		projectID, name,
	).Scan(&e.ID, &e.Name, &e.CreatedAt)

	if err != nil {
		return Environment{}, fmt.Errorf("insert environment: %w", err)
	}
	return e, nil
}

func insertIngestionKey(ctx context.Context, q querier, environmentID string) (IngestionKey, error) {
	var k IngestionKey
	err := q.QueryRow(ctx, `
			INSERT INTO ingestion_keys (environment_id, public_key)
			VALUES ($1::uuid, $2)
		  RETURNING id::text, public_key, created_at::text, revoked_at::text
	`,
		environmentID, newPublicKey(),
	).Scan(&k.ID, &k.PublicKey, &k.CreatedAt, &k.RevokedAt)

	if err != nil {
		return IngestionKey{}, fmt.Errorf("insert ingestion key: %w", err)
	}
	return k, nil
}

// exists reports whether a row with the given id exists in table. A malformed
// id is reported as (false, nil) — it can't match any row. A genuine query
// failure (e.g. DB outage) is returned as an error so callers don't mistake it
// for "not found".
func (s *Store) exists(ctx context.Context, table, id string) (bool, error) {
	if !validUUID(id) {
		return false, nil
	}
	var one int
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT 1 FROM %s WHERE id = $1::uuid`, table), id).Scan(&one)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return false, fmt.Errorf("exists(%s): %w", table, err)
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// validUUID reports whether s is a well-formed UUID string.
func validUUID(s string) bool { return uuidRe.MatchString(s) }

// newPublicKey returns an opaque, SDK-embeddable key: "pk_" + 24 hex chars.
func newPublicKey() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b) // crypto/rand.Read never returns an error on supported platforms
	return "pk_" + hex.EncodeToString(b)
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slugify turns "Customer Portal" into "customer-portal".
func slugify(name string) string {
	s := nonSlug.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	return strings.Trim(s, "-")
}
