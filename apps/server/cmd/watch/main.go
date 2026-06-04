// watch is the Watch backend server: ingestion API, dashboard API,
// background worker, and alerting. See docs/architecture.md for the
// big-picture diagram.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/AgiriTaofeek/watch/apps/server/internal/config"
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

	// Build the slog handler with the requested level and install it
	// as the default. Every package that calls slog.* downstream sees
	// the same handler.
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLogLevel(cfg.LogLevel),
	})
	logger := slog.New(handler)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("watch starting",
		"listen_addr", cfg.ListenAddr,
		"log_level", cfg.LogLevel,
		"database_url", cfg.RedactedDatabaseURL(),
	)

	<-ctx.Done()
	logger.Info("watch shutting down")
}

// parseLogLevel converts a string log level into the slog.Level enum.
// Unknown values fall back to LevelInfo so a typo doesn't silently
// suppress all logs.
func parseLogLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
