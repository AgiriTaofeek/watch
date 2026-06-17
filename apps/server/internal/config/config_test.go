package config

import "testing"

func TestLoadCookieSecure(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://watch:watch@localhost:5432/watch?sslmode=disable")
	t.Setenv("WATCH_COOKIE_SECURE", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.CookieSecure != "true" {
		t.Fatalf("CookieSecure = %q, want true", cfg.CookieSecure)
	}
}

func TestLoadRejectsInvalidCookieSecure(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://watch:watch@localhost:5432/watch?sslmode=disable")
	t.Setenv("WATCH_COOKIE_SECURE", "sometimes")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid cookie secure error")
	}
}
