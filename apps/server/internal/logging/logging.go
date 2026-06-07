package logging

import (
	"log/slog"
	"os"
	"strings"
)

func New(level string) *slog.Logger {
	// Build the slog handler with the requested level and install it
	// as the default. Every package that calls slog.* downstream sees
	// the same handler.
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(level),
	})

	return slog.New(handler)
}

// parseLevel converts a string log level into the slog.Level enum.
// Unknown values fall back to LevelInfo so a typo doesn't silently
// suppress all logs.
func parseLevel(s string) slog.Level {
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
