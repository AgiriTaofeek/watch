package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
)

func newIntegrationStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("WATCH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("WATCH_TEST_DATABASE_URL is not set")
	}
	if _, err := RunMigrations(dsn); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	st, err := New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect test store: %v", err)
	}
	t.Cleanup(st.Close)
	resetIntegrationDB(t, st)
	return st
}

func resetIntegrationDB(t *testing.T, st *Store) {
	t.Helper()
	_, err := st.Pool().Exec(context.Background(), `
		TRUNCATE
			sessions,
			dropped_event_counters,
			raw_events,
			ingestion_keys,
			environments,
			projects,
			users,
			organizations
		CASCADE
	`)
	if err != nil {
		t.Fatalf("reset test db: %v", err)
	}
}

func TestCreateFirstOwnerConcurrent(t *testing.T) {
	st := newIntegrationStore(t)
	ctx := context.Background()

	const workers = 8
	var wg sync.WaitGroup
	errs := make(chan error, workers)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := st.CreateFirstOwner(ctx, fmt.Sprintf("owner-%d@example.com", i), "hash")
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)

	var created int
	var setupComplete int
	for err := range errs {
		switch {
		case err == nil:
			created++
		case errors.Is(err, ErrSetupComplete):
			setupComplete++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if created != 1 {
		t.Fatalf("created owners = %d, want 1", created)
	}
	if setupComplete != workers-1 {
		t.Fatalf("setup-complete errors = %d, want %d", setupComplete, workers-1)
	}
	count, err := st.CountUsers(ctx)
	if err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Fatalf("users in db = %d, want 1", count)
	}
}

func TestProjectAllowedOriginsPersistAndResolveThroughKeyLookup(t *testing.T) {
	st := newIntegrationStore(t)
	ctx := context.Background()

	project, err := st.CreateProject(ctx, "Customer Portal", []string{
		" https://app.example.com ",
		"https://app.example.com",
		"https://admin.example.com",
		"",
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	wantOrigins := []string{"https://app.example.com", "https://admin.example.com"}
	if !sameStrings(project.AllowedOrigins, wantOrigins) {
		t.Fatalf("project allowed origins = %#v, want %#v", project.AllowedOrigins, wantOrigins)
	}

	projects, err := st.ListProjects(ctx)
	if err != nil {
		t.Fatalf("list projects: %v", err)
	}
	if len(projects) != 1 || !sameStrings(projects[0].AllowedOrigins, wantOrigins) {
		t.Fatalf("listed projects = %#v, want allowed origins %#v", projects, wantOrigins)
	}

	publicKey := project.Environments[0].Keys[0].PublicKey
	lookup, err := st.LookupIngestionKey(ctx, publicKey)
	if err != nil {
		t.Fatalf("lookup ingestion key: %v", err)
	}
	if !sameStrings(lookup.AllowedOrigins, wantOrigins) {
		t.Fatalf("lookup allowed origins = %#v, want %#v", lookup.AllowedOrigins, wantOrigins)
	}
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
