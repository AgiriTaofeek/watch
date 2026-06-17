package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"
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

func TestUpsertIssueCountsDistinctAffectedUsers(t *testing.T) {
	st := newIntegrationStore(t)
	ctx := context.Background()

	project, err := st.CreateProject(ctx, "Checkout", nil)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	envID := project.Environments[0].ID
	userA := "user-a"
	userB := "user-b"
	now := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)

	issueID, err := st.UpsertIssue(ctx, UpsertIssueParams{
		ProjectID:     project.ID,
		EnvironmentID: envID,
		Fingerprint:   "fingerprint-1",
		Title:         "TypeError: boom",
		Culprit:       "/checkout",
		LastSeenAt:    now,
		UserIDHash:    &userA,
	})
	if err != nil {
		t.Fatalf("upsert issue: %v", err)
	}
	for _, userIDHash := range []*string{&userA, &userB} {
		if _, err := st.UpsertIssue(ctx, UpsertIssueParams{
			ProjectID:     project.ID,
			EnvironmentID: envID,
			Fingerprint:   "fingerprint-1",
			Title:         "TypeError: boom",
			Culprit:       "/checkout",
			LastSeenAt:    now.Add(time.Minute),
			UserIDHash:    userIDHash,
		}); err != nil {
			t.Fatalf("upsert issue again: %v", err)
		}
	}

	issue, err := st.GetIssue(ctx, issueID)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.EventCount != 3 {
		t.Fatalf("event count = %d, want 3", issue.EventCount)
	}
	if issue.UserCount != 2 {
		t.Fatalf("user count = %d, want 2", issue.UserCount)
	}
}

func TestVitalRollupsAreIdempotentAndQueryAggregatesRoutes(t *testing.T) {
	st := newIntegrationStore(t)
	ctx := context.Background()

	project, err := st.CreateProject(ctx, "Vitals", nil)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	envID := project.Environments[0].ID
	hour := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)

	firstRoute := UpsertVitalRollupParams{
		ProjectID:     project.ID,
		EnvironmentID: envID,
		Route:         "/checkout",
		PeriodStart:   hour,
		MetricName:    "LCP",
		SampleCount:   2,
		SumValue:      300,
		Samples:       []float64{100, 200},
	}
	if err := st.UpsertVitalRollup(ctx, firstRoute); err != nil {
		t.Fatalf("upsert first vital rollup: %v", err)
	}
	if err := st.UpsertVitalRollup(ctx, firstRoute); err != nil {
		t.Fatalf("repeat first vital rollup: %v", err)
	}
	if err := st.UpsertVitalRollup(ctx, UpsertVitalRollupParams{
		ProjectID:     project.ID,
		EnvironmentID: envID,
		Route:         "/cart",
		PeriodStart:   hour,
		MetricName:    "LCP",
		SampleCount:   1,
		SumValue:      900,
		Samples:       []float64{900},
	}); err != nil {
		t.Fatalf("upsert second vital rollup: %v", err)
	}

	buckets, err := st.QueryVitalRollups(ctx, project.ID, envID, "LCP", hour, hour.Add(time.Hour))
	if err != nil {
		t.Fatalf("query vital rollups: %v", err)
	}
	if len(buckets) != 1 {
		t.Fatalf("buckets = %d, want 1: %#v", len(buckets), buckets)
	}
	if buckets[0].SampleCount != 3 {
		t.Fatalf("sample count = %d, want 3", buckets[0].SampleCount)
	}
	if buckets[0].Mean != 400 {
		t.Fatalf("mean = %v, want 400", buckets[0].Mean)
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
