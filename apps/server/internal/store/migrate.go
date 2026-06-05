package store

import (
	"embed"
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres" // registers postgres:// driver
)

// migrationsFS holds the SQL migrations compiled into the binary. The all:
// prefix embeds dotfiles too, so the .keep placeholder keeps this compiling
// before any real .sql files exist (Task 5 adds the first migration).
//
//go:embed all:migrations
var migrationsFS embed.FS

// RunMigrations applies every pending migration embedded in the binary and
// returns how many were applied this run. Safe to call on every startup:
// already-applied migrations are skipped. It uses its own short-lived
// connection (separate from the pgx pool) via the postgres:// URL.
func RunMigrations(databaseURL string) (int, error) {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return 0, fmt.Errorf("load embedded migrations: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, databaseURL)

	if err != nil {
		return 0, fmt.Errorf("init migrate: %w", err)
	}
	defer func() {
		// Close returns a source error and a database error; neither is
		// actionable at shutdown, so log rather than fail the run.
		if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
			slog.Warn("closing migrator", "source", srcErr, "database", dbErr)
		}
	}()

	before := schemaVersion(m)

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}

	after := schemaVersion(m)
	return int(after - before), nil
}

// schemaVersion returns the current migration version, or 0 if no migration
// has been applied yet. Relies on Watch's sequential 0001, 0002, ... naming
// so the version number doubles as a count of applied migrations.
func schemaVersion(m *migrate.Migrate) uint {
	v, _, err := m.Version()
	if err != nil { // includes migrate.ErrNilVersion ("no version yet")
		return 0
	}
	return v
}
