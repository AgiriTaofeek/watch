package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// User mirrors the users table row. PasswordHash is excluded from JSON
// responses (json:"-") so it is never accidentally leaked to clients.
type User struct {
	ID           string  `json:"id"`
	Email        string  `json:"email"`
	DisplayName  *string `json:"display_name"`
	Role         string  `json:"role"`
	CreatedAt    string  `json:"created_at"`
	PasswordHash string  `json:"-"`
}

// CountUsers returns the total number of user rows in the database.
// Used by handleAuthSetup to reject requests when any user already exists.
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return n, nil
}

// CreateUser inserts a new user into the given organization.
func (s *Store) CreateUser(ctx context.Context, orgID, email, passwordHash, role string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (organization_id, email, password_hash, role)
		VALUES ($1::uuid, $2, $3, $4::user_role)
		RETURNING id::text, email, display_name, role, created_at::text
	`, orgID, email, passwordHash, role).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// GetUserByEmail fetches a user by their email address.
// Returns ErrNotFound when no row matches.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, display_name, role, created_at::text, password_hash
		FROM users
		WHERE email = $1
		LIMIT 1
	`, email).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

// GetUserByID fetches a user by their primary key.
// Returns ErrNotFound when no row matches.
func (s *Store) GetUserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, display_name, role, created_at::text, password_hash
		FROM users
		WHERE id = $1::uuid
	`, id).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

// DefaultOrganizationID returns the single organization ID, creating the
// default org if none exists yet. Exposed for the auth setup handler which
// runs before any project (and therefore before the org bridge in projects.go)
// has been created.
func (s *Store) DefaultOrganizationID(ctx context.Context) (string, error) {
	return defaultOrganizationID(ctx, s.pool)
}
