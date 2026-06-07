// Package store owns the Postgres connection pool and all database access
// for watch. Every query in the server goes through this package; no other
// package imports pgx directly.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps a pgx connection pool. It is the single entry point for
// database access. Construct it with New; release it with Close.
type Store struct {
	pool *pgxpool.Pool
}

// New parses the connection string, opens a pooled connection to Postgres,
// and verifies connectivity with a Ping so we fail fast at boot. The caller
// owns the returned Store and must call Close when done.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	// Conservative defaults for a single-instance deployment; tune later.
	cfg.MaxConns = 10
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	// NewWithConfig is lazy — it doesn't dial until first use. Ping forces a
	// real connection now so a wrong URL / down DB fails startup, not request 1.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Pool exposes the underlying pgx pool for packages that run queries.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Close releases all pooled connections. Call once during shutdown.
func (s *Store) Close() { s.pool.Close() }

// Ping verifies the database is reachable. Used by the health check endpoint.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}
