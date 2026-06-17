// Package config loads the runtime configuration for watch from the
// environment. The struct it returns is the single source of truth for
// what env vars the server reads; the rest of the codebase should never
// call os.Getenv directly.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Config holds the runtime configuration for watch. All fields are
// populated by Load() from the process environment. The struct is
// immutable after construction; pass it around by value.
type Config struct {
	// DatabaseURL is the Postgres connection string. Required.
	// Example: postgres://watch:watch@localhost:5432/watch?sslmode=disable
	DatabaseURL string

	// ListenAddr is the address the HTTP server binds to.
	// Defaults to ":8080". Format follows net.Listen ("host:port" or ":port").
	ListenAddr string

	// LogLevel sets the minimum slog level. One of: debug, info, warn, error.
	// Defaults to "info". Case-insensitive.
	LogLevel string

	// CookieSecure controls whether dashboard auth cookies use the Secure
	// attribute. One of: auto, true, false. Defaults to auto.
	CookieSecure string
}

// Load reads env vars and returns a populated Config. Returns an error
// if any required variable is missing or empty.
func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: getenvDefault("DATABASE_URL", ""),
		ListenAddr:  getenvDefault("WATCH_LISTEN_ADDR", ":8080"),
		LogLevel:    getenvDefault("WATCH_LOG_LEVEL", "info"),
		CookieSecure: strings.ToLower(
			getenvDefault("WATCH_COOKIE_SECURE", "auto"),
		),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	switch cfg.CookieSecure {
	case "auto", "true", "false":
	default:
		return Config{}, fmt.Errorf("WATCH_COOKIE_SECURE must be one of auto, true, false")
	}
	return cfg, nil
}

// RedactedDatabaseURL returns DatabaseURL with the password masked to
// "***". Safe to log. Returns "<unparseable>" if the URL can't be parsed.
func (c Config) RedactedDatabaseURL() string {
	u, err := url.Parse(c.DatabaseURL)
	if err != nil {
		return "<unparseable>"
	}
	if u.User != nil {
		username := u.User.Username()
		u.User = url.UserPassword(username, "***")
	}
	return u.String()
}

// getenvDefault returns the env var's value (after trimming whitespace)
// if non-empty; otherwise returns fallback.
func getenvDefault(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v != "" {
		return v
	}
	return fallback
}
