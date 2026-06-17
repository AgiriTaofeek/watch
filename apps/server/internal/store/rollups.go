package store

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// VitalSample is one web_vital raw event extracted for rollup aggregation.
type VitalSample struct {
	ProjectID     string
	EnvironmentID string
	Route         string
	Release       *string
	PeriodStart   time.Time // event_timestamp truncated to the hour
	MetricName    string    // LCP | CLS | INP | FCP | TTFB
	Value         float64
	SessionID     string
}

// ErrorCount is one aggregated bucket of frontend_error events for a given
// (project, environment, route, release, hour).
type ErrorCount struct {
	ProjectID     string
	EnvironmentID string
	Route         string
	Release       *string
	PeriodStart   time.Time
	Count         int64
	SessionCount  int64 // distinct non-empty session IDs in this bucket
}

// UpsertErrorRollupParams carries one bucket of error counts to persist.
type UpsertErrorRollupParams struct {
	ProjectID     string
	EnvironmentID string
	Route         string
	Release       *string
	PeriodStart   time.Time
	ErrorCount    int64
	SessionCount  int64
}

// UpsertVitalRollupParams carries one bucket of vital values to persist.
type UpsertVitalRollupParams struct {
	ProjectID     string
	EnvironmentID string
	Route         string
	Release       *string
	PeriodStart   time.Time
	MetricName    string
	SampleCount   int64
	SumValue      float64
	Samples       []float64
}

// ErrorRollup is one row returned by QueryErrorRollups.
type ErrorRollup struct {
	PeriodStart  string `json:"period_start"` // RFC3339
	ErrorCount   int64  `json:"error_count"`
	SessionCount int64  `json:"session_count"`
}

// VitalRollup is one row returned by QueryVitalRollups with computed stats.
type VitalRollup struct {
	PeriodStart string  `json:"period_start"` // RFC3339
	P75         float64 `json:"p75"`
	Mean        float64 `json:"mean"`
	SampleCount int64   `json:"sample_count"`
}

// FetchVitalSamples returns all web_vital raw events whose event_timestamp
// falls within [hourStart, hourStart+1h). Used by the rollup aggregator.
func (s *Store) FetchVitalSamples(ctx context.Context, hourStart time.Time) ([]VitalSample, error) {
	hourEnd := hourStart.Add(time.Hour)
	rows, err := s.pool.Query(ctx, `
			SELECT
			    project_id::text,
			    environment_id::text,
			    COALESCE(payload->'context'->>'route', ''),
		    release,
		    date_trunc('hour', event_timestamp),
		    payload->'payload'->>'name',
		    (payload->'payload'->>'value')::float,
		    COALESCE(payload->'context'->>'session_id', '')
		FROM raw_events
		WHERE event_type = 'web_vital'
		  AND event_timestamp >= $1
		  AND event_timestamp <  $2
	`, hourStart, hourEnd)
	if err != nil {
		return nil, fmt.Errorf("fetch vital samples: %w", err)
	}
	defer rows.Close()

	var out []VitalSample
	for rows.Next() {
		var v VitalSample
		if err := rows.Scan(
			&v.ProjectID, &v.EnvironmentID, &v.Route, &v.Release,
			&v.PeriodStart, &v.MetricName, &v.Value, &v.SessionID,
		); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// FetchErrorCounts returns aggregated frontend_error counts grouped by
// (project, environment, route, release, hour) for the given hour window.
func (s *Store) FetchErrorCounts(ctx context.Context, hourStart time.Time) ([]ErrorCount, error) {
	hourEnd := hourStart.Add(time.Hour)
	rows, err := s.pool.Query(ctx, `
			SELECT
			    project_id::text,
			    environment_id::text,
			    COALESCE(payload->'context'->>'route', '') AS route,
			    release,
			    date_trunc('hour', event_timestamp) AS period_start,
			    COUNT(*)::bigint,
			    COUNT(DISTINCT NULLIF(payload->'context'->>'session_id', ''))::bigint
		FROM raw_events
		WHERE event_type = 'frontend_error'
		  AND event_timestamp >= $1
		  AND event_timestamp <  $2
		GROUP BY project_id, environment_id, route, release, period_start
	`, hourStart, hourEnd)
	if err != nil {
		return nil, fmt.Errorf("fetch error counts: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (ErrorCount, error) {
		var c ErrorCount
		return c, r.Scan(
			&c.ProjectID, &c.EnvironmentID, &c.Route, &c.Release,
			&c.PeriodStart, &c.Count, &c.SessionCount,
		)
	})
	return out, err
}

// UpsertErrorRollup persists one hourly error count bucket using an upsert
// so the aggregator can be re-run safely for the same hour.
func (s *Store) UpsertErrorRollup(ctx context.Context, p UpsertErrorRollupParams) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO error_rollups
		    (project_id, environment_id, route, release, period_start, error_count, session_count)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
		ON CONFLICT (project_id, environment_id, route, release, period_start) DO UPDATE SET
		    error_count   = EXCLUDED.error_count,
		    session_count = EXCLUDED.session_count
	`, p.ProjectID, p.EnvironmentID, p.Route, p.Release, p.PeriodStart, p.ErrorCount, p.SessionCount)
	if err != nil {
		return fmt.Errorf("upsert error rollup: %w", err)
	}
	return nil
}

// UpsertVitalRollup persists one hourly vital bucket. On conflict it replaces
// the row with the freshly computed bucket so re-running a completed hour is
// idempotent.
func (s *Store) UpsertVitalRollup(ctx context.Context, p UpsertVitalRollupParams) error {
	_, err := s.pool.Exec(ctx, `
			INSERT INTO vital_rollups
			    (project_id, environment_id, route, release, period_start,
			     metric_name, sample_count, sum_value, samples)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name)
			DO UPDATE SET
			    sample_count = EXCLUDED.sample_count,
			    sum_value    = EXCLUDED.sum_value,
			    samples      = EXCLUDED.samples
	`, p.ProjectID, p.EnvironmentID, p.Route, p.Release, p.PeriodStart,
		p.MetricName, p.SampleCount, p.SumValue, p.Samples)
	if err != nil {
		return fmt.Errorf("upsert vital rollup: %w", err)
	}
	return nil
}

// QueryErrorRollups returns hourly error buckets for a project/environment
// within [from, to). Results are ordered by period_start ascending.
func (s *Store) QueryErrorRollups(
	ctx context.Context,
	projectID, envID string,
	from, to time.Time,
) ([]ErrorRollup, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT period_start::text, SUM(error_count)::bigint, SUM(session_count)::bigint
		FROM error_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		GROUP BY period_start
		ORDER BY period_start
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query error rollups: %w", err)
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (ErrorRollup, error) {
		var b ErrorRollup
		return b, r.Scan(&b.PeriodStart, &b.ErrorCount, &b.SessionCount)
	})
}

// QueryVitalRollups returns hourly vital buckets for a project/environment and
// metric within [from, to). p75 and mean are computed from stored samples.
func (s *Store) QueryVitalRollups(
	ctx context.Context,
	projectID, envID, metric string,
	from, to time.Time,
) ([]VitalRollup, error) {
	rows, err := s.pool.Query(ctx, `
			WITH periods AS (
			    SELECT period_start, SUM(sample_count)::bigint AS sample_count, SUM(sum_value)::float AS sum_value
			    FROM vital_rollups
			    WHERE project_id = $1::uuid AND environment_id = $2::uuid
			      AND metric_name = $3
			      AND period_start >= $4 AND period_start < $5
			    GROUP BY period_start
			)
			SELECT
			    p.period_start::text,
			    p.sample_count,
			    p.sum_value,
			    COALESCE(sample_set.samples, '{}')::float[]
			FROM periods p
			LEFT JOIN LATERAL (
			    SELECT ARRAY_AGG(sample) AS samples
			    FROM (
			        SELECT UNNEST(vr.samples) AS sample
			        FROM vital_rollups vr
			        WHERE vr.project_id = $1::uuid AND vr.environment_id = $2::uuid
			          AND vr.metric_name = $3
			          AND vr.period_start = p.period_start
			        LIMIT 200
			    ) limited_samples
			) sample_set ON true
			ORDER BY p.period_start
		`, projectID, envID, metric, from, to)
	if err != nil {
		return nil, fmt.Errorf("query vital rollups: %w", err)
	}
	type raw struct {
		periodStart string
		sampleCount int64
		sumValue    float64
		samples     []float64
	}
	raws, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (raw, error) {
		var v raw
		return v, r.Scan(&v.periodStart, &v.sampleCount, &v.sumValue, &v.samples)
	})
	if err != nil {
		return nil, err
	}

	out := make([]VitalRollup, 0, len(raws))
	for _, v := range raws {
		rollup := VitalRollup{
			PeriodStart: v.periodStart,
			SampleCount: v.sampleCount,
		}
		if v.sampleCount > 0 {
			rollup.Mean = v.sumValue / float64(v.sampleCount)
		}
		rollup.P75 = p75(v.samples)
		out = append(out, rollup)
	}
	return out, nil
}

// p75 returns the 75th-percentile value from a slice of floats.
// Returns 0 for an empty slice.
func p75(samples []float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sorted := make([]float64, len(samples))
	copy(sorted, samples)
	sort.Float64s(sorted)
	idx := int(math.Ceil(0.75*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	return sorted[idx]
}
