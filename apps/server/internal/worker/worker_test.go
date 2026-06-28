package worker

import (
	"context"
	"testing"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

type fakeWorkerStore struct {
	vitalSamples []store.VitalSample
	errorCounts  []store.ErrorCount

	vitalUpserts []store.UpsertVitalRollupParams
	errorUpserts []store.UpsertErrorRollupParams
	navUpserts   []store.UpsertNavRollupParams
}

func (f *fakeWorkerStore) FetchUnprocessedErrors(context.Context, int) ([]store.UnprocessedError, error) {
	return nil, nil
}

func (f *fakeWorkerStore) UpsertIssue(context.Context, store.UpsertIssueParams) (string, error) {
	return "issue-1", nil
}

func (f *fakeWorkerStore) AssignIssue(context.Context, string, string) error { return nil }

func (f *fakeWorkerStore) FetchVitalSamples(context.Context, time.Time) ([]store.VitalSample, error) {
	return f.vitalSamples, nil
}

func (f *fakeWorkerStore) FetchErrorCounts(context.Context, time.Time) ([]store.ErrorCount, error) {
	return f.errorCounts, nil
}

func (f *fakeWorkerStore) UpsertErrorRollupsBatch(_ context.Context, params []store.UpsertErrorRollupParams) error {
	f.errorUpserts = append(f.errorUpserts, params...)
	return nil
}

func (f *fakeWorkerStore) UpsertVitalRollupsBatch(_ context.Context, params []store.UpsertVitalRollupParams) error {
	f.vitalUpserts = append(f.vitalUpserts, params...)
	return nil
}

func (f *fakeWorkerStore) FetchNetworkRequestSamples(context.Context, time.Time) ([]store.NetworkRequestSample, error) {
	return nil, nil
}

func (f *fakeWorkerStore) UpsertNetworkRollupsBatch(context.Context, []store.UpsertNetworkRollupParams) error {
	return nil
}

func (f *fakeWorkerStore) FetchNavSamples(context.Context, time.Time) ([]store.NavSample, error) {
	return nil, nil
}

func (f *fakeWorkerStore) UpsertNavRollupsBatch(_ context.Context, params []store.UpsertNavRollupParams) error {
	f.navUpserts = append(f.navUpserts, params...)
	return nil
}

func (f *fakeWorkerStore) DeleteExpiredEvents(context.Context, time.Time) (int64, error) {
	return 0, nil
}

func TestAggregateVitalRollupsCountsAllSamplesAndCapsStoredSamples(t *testing.T) {
	hour := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)
	fake := &fakeWorkerStore{}
	for i := 0; i < 250; i++ {
		fake.vitalSamples = append(fake.vitalSamples, store.VitalSample{
			ProjectID:     "project-1",
			EnvironmentID: "env-1",
			Route:         "/checkout",
			PeriodStart:   hour,
			MetricName:    "LCP",
			Value:         float64(i + 1),
		})
	}

	w := &Worker{store: fake}
	w.aggregateVitalRollups(context.Background(), hour)

	if len(fake.vitalUpserts) != 1 {
		t.Fatalf("vital upserts = %d, want 1", len(fake.vitalUpserts))
	}
	got := fake.vitalUpserts[0]
	if got.SampleCount != 250 {
		t.Fatalf("sample count = %d, want 250", got.SampleCount)
	}
	if len(got.Samples) != 200 {
		t.Fatalf("stored samples = %d, want 200", len(got.Samples))
	}
	if got.SumValue != 31375 {
		t.Fatalf("sum value = %v, want 31375", got.SumValue)
	}
}

func TestAggregateErrorRollupsUsesDistinctSessionCountFromStore(t *testing.T) {
	hour := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)
	fake := &fakeWorkerStore{
		errorCounts: []store.ErrorCount{{
			ProjectID:     "project-1",
			EnvironmentID: "env-1",
			Route:         "/checkout",
			PeriodStart:   hour,
			Count:         12,
			SessionCount:  0,
		}},
	}

	w := &Worker{store: fake}
	w.aggregateErrorRollups(context.Background(), hour)

	if len(fake.errorUpserts) != 1 {
		t.Fatalf("error upserts = %d, want 1", len(fake.errorUpserts))
	}
	got := fake.errorUpserts[0]
	if got.SessionCount != 0 {
		t.Fatalf("session count = %d, want 0", got.SessionCount)
	}
}

var _ Store = (*fakeWorkerStore)(nil)
