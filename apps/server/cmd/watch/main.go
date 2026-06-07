// watch is the Watch backend server: ingestion API, dashboard API,
// background worker, and alerting. See docs/architecture.md for the
// big-picture diagram.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/config"
	"github.com/AgiriTaofeek/watch/apps/server/internal/logging"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// Boot-time failures bypass slog setup — emit a plain message
		// and exit. Process supervisors (Docker, systemd, k8s) read
		// stderr regardless of structured-logging conventions.
		_, _ = os.Stderr.WriteString("watch configuration error: " + err.Error() + "\n")
		os.Exit(1)
	}

	// Set up logging before doing anything else so all subsequent logs are structured and respect the configured level. The logger is safe for
	// concurrent use by all packages, so we don't need to pass it around.
	logger := logging.New(cfg.LogLevel)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	st, err := store.New(connectCtx, cfg.DatabaseURL)

	if err != nil {
		logger.Error("failed to connect to Postgres", "error", err)
		os.Exit(1)
	}

	defer st.Close()

	logger.Info("Connected to Postgres")

	applied, err := store.RunMigrations(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("migrations applied", "count", applied)

	logger.Info("watch starting",
		"listen_addr", cfg.ListenAddr,
		"log_level", cfg.LogLevel,
		"database_url", cfg.RedactedDatabaseURL(),
	)

	<-ctx.Done()
	logger.Info("watch shutting down")
}
