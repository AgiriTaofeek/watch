// Package worker runs background aggregation loops that process raw events
// after they have been ingested: error classification into issues, hourly
// metric rollups, and raw event retention cleanup.
package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/stats"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

// Store is the narrow database interface the worker needs. It is satisfied by
// *store.Store and can be faked in tests without a Postgres process.
type Store interface {
	FetchUnprocessedErrors(ctx context.Context, limit int) ([]store.UnprocessedError, error)
	UpsertIssue(ctx context.Context, p store.UpsertIssueParams) (issueID string, err error)
	AssignIssue(ctx context.Context, eventID, issueID string) error

	FetchVitalSamples(ctx context.Context, hourStart time.Time) ([]store.VitalSample, error)
	FetchErrorCounts(ctx context.Context, hourStart time.Time) ([]store.ErrorCount, error)
	UpsertErrorRollupsBatch(ctx context.Context, params []store.UpsertErrorRollupParams) error
	UpsertVitalRollupsBatch(ctx context.Context, params []store.UpsertVitalRollupParams) error

	FetchNetworkRequestSamples(ctx context.Context, hourStart time.Time) ([]store.NetworkRequestSample, error)
	UpsertNetworkRollupsBatch(ctx context.Context, params []store.UpsertNetworkRollupParams) error

	FetchNavSamples(ctx context.Context, hourStart time.Time) ([]store.NavSample, error)
	UpsertNavRollupsBatch(ctx context.Context, params []store.UpsertNavRollupParams) error

	DeleteExpiredEvents(ctx context.Context, before time.Time) (deleted int64, err error)
}

// Worker runs three background loops: error classifier, rollup aggregator, and
// retention cleaner. All loops respect context cancellation so they exit cleanly
// when the server shuts down.
type Worker struct {
	store     Store
	logger    *slog.Logger
	retention time.Duration
}

// New creates a Worker. retention is the maximum age of raw events before they
// are deleted by the cleaner loop.
func New(store Store, logger *slog.Logger, retention time.Duration) *Worker {
	return &Worker{store: store, logger: logger, retention: retention}
}

// Start launches the three background goroutines. It returns immediately; the
// goroutines run until ctx is cancelled. Call this after the HTTP server starts
// and pass the same context used for graceful shutdown.
func (w *Worker) Start(ctx context.Context) {
	go w.runIssueClassifier(ctx)
	go w.runRollupAggregator(ctx)
	go w.runRetentionCleaner(ctx)
}

// runIssueClassifier polls every 30 seconds for unprocessed frontend_error
// events and classifies each into an issue via fingerprint matching.
func (w *Worker) runIssueClassifier(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			w.classifyErrors(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// classifyErrors fetches up to 500 unprocessed errors in one batch, computes
// a fingerprint for each, upserts the corresponding issue, and links the raw
// event to the issue.
func (w *Worker) classifyErrors(ctx context.Context) {
	events, err := w.store.FetchUnprocessedErrors(ctx, 500)
	if err != nil {
		slog.ErrorContext(ctx, "worker: fetch unprocessed errors", "error", err)
		return
	}
	for _, e := range events {
		fp := FingerprintError(e.Name, e.Message, e.Route)
		title := e.Name + ": " + e.Message
		if len(title) > 500 {
			title = title[:500]
		}
		issueID, err := w.store.UpsertIssue(ctx, store.UpsertIssueParams{
			ProjectID:     e.ProjectID,
			EnvironmentID: e.EnvironmentID,
			Fingerprint:   fp,
			Title:         title,
			Culprit:       e.Route,
			LastSeenAt:    e.EventTimestamp,
			UserIDHash:    e.UserIDHash,
		})
		if err != nil {
			slog.ErrorContext(ctx, "worker: upsert issue", "error", err, "event_id", e.EventID)
			continue
		}
		if err := w.store.AssignIssue(ctx, e.EventID, issueID); err != nil {
			slog.ErrorContext(ctx, "worker: assign issue", "error", err,
				"event_id", e.EventID, "issue_id", issueID)
		}
	}
}

// runRollupAggregator polls every 5 minutes and computes rollups for the
// previous complete hour. Aggregating completed hours avoids partial buckets.
func (w *Worker) runRollupAggregator(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			// Previous complete hour: truncate now to hour, subtract 1 hour.
			prevHour := time.Now().UTC().Truncate(time.Hour).Add(-time.Hour)
			w.aggregateErrorRollups(ctx, prevHour)
			w.aggregateVitalRollups(ctx, prevHour)
			w.aggregateNetworkRollups(ctx, prevHour)
			w.aggregateNavRollups(ctx, prevHour)
		case <-ctx.Done():
			return
		}
	}
}

func (w *Worker) aggregateErrorRollups(ctx context.Context, hourStart time.Time) {
	counts, err := w.store.FetchErrorCounts(ctx, hourStart)
	if err != nil {
		slog.ErrorContext(ctx, "worker: fetch error counts", "error", err)
		return
	}
	params := make([]store.UpsertErrorRollupParams, 0, len(counts))
	for _, c := range counts {
		params = append(params, store.UpsertErrorRollupParams{
			ProjectID:     c.ProjectID,
			EnvironmentID: c.EnvironmentID,
			Route:         c.Route,
			Release:       c.Release,
			PeriodStart:   c.PeriodStart,
			ErrorCount:    c.Count,
			SessionCount:  c.SessionCount,
		})
	}
	if err := w.store.UpsertErrorRollupsBatch(ctx, params); err != nil {
		slog.ErrorContext(ctx, "worker: upsert error rollups", "error", err)
	}
}

func (w *Worker) aggregateVitalRollups(ctx context.Context, hourStart time.Time) {
	samples, err := w.store.FetchVitalSamples(ctx, hourStart)
	if err != nil {
		slog.ErrorContext(ctx, "worker: fetch vital samples", "error", err)
		return
	}

	// Group samples into buckets keyed by (project, env, route, release, hour, metric).
	type key struct {
		projectID, environmentID, route, metric string
		release                                 *string
		periodStart                             time.Time
	}
	type bucket struct {
		sum     float64
		count   int64
		samples []float64
	}
	buckets := make(map[key]*bucket)

	for i := range samples {
		s := &samples[i]
		k := key{
			projectID:     s.ProjectID,
			environmentID: s.EnvironmentID,
			route:         s.Route,
			release:       s.Release,
			metric:        s.MetricName,
			periodStart:   s.PeriodStart,
		}
		b, ok := buckets[k]
		if !ok {
			b = &bucket{}
			buckets[k] = b
		}
		b.sum += s.Value
		b.count++
		// Cap stored samples at 200 per bucket to bound the array size.
		if len(b.samples) < 200 {
			b.samples = append(b.samples, s.Value)
		}
	}

	params := make([]store.UpsertVitalRollupParams, 0, len(buckets))
	for k, b := range buckets {
		params = append(params, store.UpsertVitalRollupParams{
			ProjectID:     k.projectID,
			EnvironmentID: k.environmentID,
			Route:         k.route,
			Release:       k.release,
			PeriodStart:   k.periodStart,
			MetricName:    k.metric,
			SampleCount:   b.count,
			SumValue:      b.sum,
			Samples:       b.samples,
		})
	}
	if err := w.store.UpsertVitalRollupsBatch(ctx, params); err != nil {
		slog.ErrorContext(ctx, "worker: upsert vital rollups", "error", err)
	}
}

func (w *Worker) aggregateNetworkRollups(ctx context.Context, hourStart time.Time) {
	samples, err := w.store.FetchNetworkRequestSamples(ctx, hourStart)
	if err != nil {
		slog.ErrorContext(ctx, "worker: fetch network request samples", "error", err)
		return
	}

	// Group by (project, env, url, method, status_code, hour).
	type key struct {
		projectID, environmentID, url, method string
		statusCode                            int
		periodStart                           time.Time
	}
	type bucket struct {
		count    int64
		sessions map[string]struct{}
		lastSeen time.Time
	}
	buckets := make(map[key]*bucket)

	for i := range samples {
		s := &samples[i]
		k := key{
			projectID:     s.ProjectID,
			environmentID: s.EnvironmentID,
			url:           s.URL,
			method:        s.Method,
			statusCode:    s.StatusCode,
			periodStart:   s.PeriodStart,
		}
		b, ok := buckets[k]
		if !ok {
			b = &bucket{sessions: make(map[string]struct{})}
			buckets[k] = b
		}
		b.count++
		if s.SessionID != "" {
			b.sessions[s.SessionID] = struct{}{}
		}
		if s.OccurredAt.After(b.lastSeen) {
			b.lastSeen = s.OccurredAt
		}
	}

	params := make([]store.UpsertNetworkRollupParams, 0, len(buckets))
	for k, b := range buckets {
		params = append(params, store.UpsertNetworkRollupParams{
			ProjectID:     k.projectID,
			EnvironmentID: k.environmentID,
			URL:           k.url,
			Method:        k.method,
			StatusCode:    k.statusCode,
			PeriodStart:   k.periodStart,
			RequestCount:  b.count,
			FailureCount:  b.count,
			SessionCount:  int64(len(b.sessions)),
			LastSeenAt:    b.lastSeen,
		})
	}
	if err := w.store.UpsertNetworkRollupsBatch(ctx, params); err != nil {
		slog.ErrorContext(ctx, "worker: upsert network rollups", "error", err)
	}
}

func (w *Worker) aggregateNavRollups(ctx context.Context, hourStart time.Time) {
	samples, err := w.store.FetchNavSamples(ctx, hourStart)
	if err != nil {
		slog.ErrorContext(ctx, "worker: fetch nav samples", "error", err)
		return
	}

	// Group by (project, env, route, nav_type, hour).
	type key struct {
		projectID, environmentID, route, navType string
		periodStart                              time.Time
	}
	type bucket struct {
		sessions map[string]struct{}
		dns      []float64
		tcp      []float64
		tls      []float64
		ttfb     []float64
		dom      []float64
	}
	buckets := make(map[key]*bucket)

	for i := range samples {
		s := &samples[i]
		k := key{
			projectID:     s.ProjectID,
			environmentID: s.EnvironmentID,
			route:         s.Route,
			navType:       s.NavType,
			periodStart:   s.PeriodStart,
		}
		b, ok := buckets[k]
		if !ok {
			b = &bucket{sessions: make(map[string]struct{})}
			buckets[k] = b
		}
		if s.SessionID != "" {
			b.sessions[s.SessionID] = struct{}{}
		}
		// Cap stored samples at 200 per bucket to bound memory use.
		if len(b.dns) < 200 {
			b.dns = append(b.dns, s.DNS)
			b.tcp = append(b.tcp, s.TCP)
			b.tls = append(b.tls, s.TLS)
			b.ttfb = append(b.ttfb, s.TTFB)
			b.dom = append(b.dom, s.DOM)
		}
	}

	params := make([]store.UpsertNavRollupParams, 0, len(buckets))
	for k, b := range buckets {
		params = append(params, store.UpsertNavRollupParams{
			ProjectID:     k.projectID,
			EnvironmentID: k.environmentID,
			Route:         k.route,
			NavType:       k.navType,
			PeriodStart:   k.periodStart,
			SessionCount:  int64(len(b.sessions)),
			DNSP75:        stats.P75(b.dns),
			TCPP75:        stats.P75(b.tcp),
			TLSP75:        stats.P75(b.tls),
			TTFBP75:       stats.P75(b.ttfb),
			DOMP75:        stats.P75(b.dom),
		})
	}
	if err := w.store.UpsertNavRollupsBatch(ctx, params); err != nil {
		slog.ErrorContext(ctx, "worker: upsert nav rollups", "error", err)
	}
}

// runRetentionCleaner deletes raw_events older than the configured retention
// duration once per day.
func (w *Worker) runRetentionCleaner(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			before := time.Now().UTC().Add(-w.retention)
			deleted, err := w.store.DeleteExpiredEvents(ctx, before)
			if err != nil {
				slog.ErrorContext(ctx, "worker: delete expired events", "error", err)
			} else {
				slog.InfoContext(ctx, "worker: retention cleanup",
					"deleted", deleted, "before", before)
			}
		case <-ctx.Done():
			return
		}
	}
}
