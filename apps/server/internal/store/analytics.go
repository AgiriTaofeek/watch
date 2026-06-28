package store

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/AgiriTaofeek/watch/apps/server/internal/stats"
)

// DBStats holds the pool metrics the API exposes on the system health endpoint.
// It decouples the api package from the pgxpool type.
type DBStats struct {
	TotalConns int32
	IdleConns  int32
	MaxConns   int32
}

// SystemHealthStats returns current connection pool counters.
func (s *Store) SystemHealthStats() DBStats {
	stat := s.pool.Stat()
	return DBStats{
		TotalConns: stat.TotalConns(),
		IdleConns:  stat.IdleConns(),
		MaxConns:   stat.MaxConns(),
	}
}

// RouteSummary aggregates error and vital metrics across the requested time
// window for a single route.
type RouteSummary struct {
	Route       string  `json:"route"`
	Sessions    int64   `json:"sessions"`
	Errors      int64   `json:"errors"`
	ErrorRate   float64 `json:"error_rate"`
	LCPP75      float64 `json:"lcp_p75"`
	INPP75      float64 `json:"inp_p75"`
	FCPP75      float64 `json:"fcp_p75"`
	CLSP75      float64 `json:"cls_p75"`
	TTFBP75     float64 `json:"ttfb_p75"`
	HealthScore int     `json:"health_score"`
}

// RouteSummaryResult wraps the per-route list and derived summary stats.
type RouteSummaryResult struct {
	Routes          []RouteSummary `json:"routes"`
	OverallHealth   int            `json:"overall_health"`
	RouteCount      int            `json:"route_count"`
	PoorHealthCount int            `json:"poor_health_count"`
	AvgErrorRate    float64        `json:"avg_error_rate"`
}

// NetworkRollup is one row of aggregated network failure data returned by
// QueryNetworkRollups. Metrics are summed across the requested time window.
type NetworkRollup struct {
	Method        string  `json:"method"`
	URLPattern    string  `json:"url_pattern"`
	StatusCode    int     `json:"status_code"`
	InitiatorType string  `json:"initiator_type"`
	RequestCount  int64   `json:"request_count"`
	FailureCount  int64   `json:"failure_count"`
	SessionCount  int64   `json:"session_count"`
	FailRate      float64 `json:"fail_rate"`
	LastSeenAt    string  `json:"last_seen_at"`
}

// NavTiming holds the p75 timing breakdown for the requested window.
type NavTiming struct {
	DNSP75  float64 `json:"dns_p75"`
	TCPP75  float64 `json:"tcp_p75"`
	TLSP75  float64 `json:"tls_p75"`
	TTFBP75 float64 `json:"ttfb_p75"`
	FCPP75  float64 `json:"fcp_p75"`
	LCPP75  float64 `json:"lcp_p75"`
	DOMP75  float64 `json:"dom_p75"`
}

// NavRouteRow is per-route timing summary for the performance timing table.
type NavRouteRow struct {
	Route    string  `json:"route"`
	Sessions int64   `json:"sessions"`
	FCPP75   float64 `json:"fcp_p75"`
	LCPP75   float64 `json:"lcp_p75"`
	TTFBP75  float64 `json:"ttfb_p75"`
}

// NavSummaryResult is the full response for the navigation summary endpoint.
type NavSummaryResult struct {
	HardNavSessions int64         `json:"hard_nav_sessions"`
	SPANavSessions  int64         `json:"spa_nav_sessions"`
	TotalSessions   int64         `json:"total_sessions"`
	Timing          NavTiming     `json:"timing"`
	Routes          []NavRouteRow `json:"routes"`
}

// QueryRouteRollups aggregates error and vital rollup data per route for the
// given project, environment, and time window. Routes with fewer than 2
// sessions or no vital data are omitted to avoid noisy single-event entries.
func (s *Store) QueryRouteRollups(
	ctx context.Context,
	projectID, envID string,
	from, to time.Time,
) (*RouteSummaryResult, error) {
	// Aggregate errors per route.
	errRows, err := s.pool.Query(ctx, `
		SELECT route,
		       SUM(error_count)::bigint   AS errors,
		       SUM(session_count)::bigint AS sessions
		FROM error_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		  AND route <> ''
		GROUP BY route
		ORDER BY errors DESC
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query route error rollups: %w", err)
	}
	type errRow struct {
		route    string
		errors   int64
		sessions int64
	}
	errMap := map[string]errRow{}
	for errRows.Next() {
		var r errRow
		if err := errRows.Scan(&r.route, &r.errors, &r.sessions); err != nil {
			errRows.Close()
			return nil, err
		}
		errMap[r.route] = r
	}
	errRows.Close()
	if err := errRows.Err(); err != nil {
		return nil, err
	}

	// Aggregate vital samples per (route, metric) so we can compute p75.
	type vitalKey struct {
		route  string
		metric string
	}
	vitalRows, err := s.pool.Query(ctx, `
		SELECT route, metric_name,
		       ARRAY_AGG(sample) AS samples
		FROM vital_rollups,
		     UNNEST(samples) AS sample
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		  AND route <> ''
		GROUP BY route, metric_name
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query route vital rollups: %w", err)
	}
	vitalMap := map[vitalKey][]float64{}
	for vitalRows.Next() {
		var route, metric string
		var samples []float64
		if err := vitalRows.Scan(&route, &metric, &samples); err != nil {
			vitalRows.Close()
			return nil, err
		}
		vitalMap[vitalKey{route, metric}] = samples
	}
	vitalRows.Close()
	if err := vitalRows.Err(); err != nil {
		return nil, err
	}

	// Collect all routes seen in either table.
	routeSet := map[string]struct{}{}
	for k := range errMap {
		routeSet[k] = struct{}{}
	}
	for k := range vitalMap {
		routeSet[k.route] = struct{}{}
	}

	routes := make([]string, 0, len(routeSet))
	for r := range routeSet {
		routes = append(routes, r)
	}
	slices.Sort(routes)

	summaries := make([]RouteSummary, 0, len(routes))
	for _, route := range routes {
		e := errMap[route]
		sess := e.sessions
		errs := e.errors
		errorRate := 0.0
		if sess > 0 {
			errorRate = float64(errs) / float64(sess)
		}

		lcpP75 := stats.P75(vitalMap[vitalKey{route, "LCP"}])
		inpP75 := stats.P75(vitalMap[vitalKey{route, "INP"}])
		fcpP75 := stats.P75(vitalMap[vitalKey{route, "FCP"}])
		clsP75 := stats.P75(vitalMap[vitalKey{route, "CLS"}])
		ttfbP75 := stats.P75(vitalMap[vitalKey{route, "TTFB"}])

		score := routeHealthScore(lcpP75, inpP75, clsP75, errorRate)

		summaries = append(summaries, RouteSummary{
			Route:       route,
			Sessions:    sess,
			Errors:      errs,
			ErrorRate:   errorRate,
			LCPP75:      lcpP75,
			INPP75:      inpP75,
			FCPP75:      fcpP75,
			CLSP75:      clsP75,
			TTFBP75:     ttfbP75,
			HealthScore: score,
		})
	}

	// Sort by health score ascending so degraded routes appear first.
	slices.SortFunc(summaries, func(a, b RouteSummary) int {
		return cmp.Compare(a.HealthScore, b.HealthScore)
	})

	// Compute aggregate summary stats.
	overallHealth := 100
	poorCount := 0
	totalErrRate := 0.0
	for _, s := range summaries {
		if s.HealthScore < overallHealth {
			overallHealth = s.HealthScore
		}
		if s.HealthScore < 60 {
			poorCount++
		}
		totalErrRate += s.ErrorRate
	}
	avgErrRate := 0.0
	if len(summaries) > 0 {
		avgErrRate = totalErrRate / float64(len(summaries))
		// Overall health is the mean across all routes (not just worst).
		total := 0
		for _, s := range summaries {
			total += s.HealthScore
		}
		overallHealth = total / len(summaries)
	}

	return &RouteSummaryResult{
		Routes:          summaries,
		OverallHealth:   overallHealth,
		RouteCount:      len(summaries),
		PoorHealthCount: poorCount,
		AvgErrorRate:    avgErrRate,
	}, nil
}

// routeHealthScore computes a 0–100 health score from vital p75 values and
// the error rate. Penalty table mirrors Google's Core Web Vitals thresholds.
func routeHealthScore(lcpP75, inpP75, clsP75, errorRate float64) int {
	score := 100.0

	// LCP thresholds: good <2500, needs-improvement <4000
	switch {
	case lcpP75 > 4000:
		score -= 20
	case lcpP75 > 2500:
		score -= 10
	}

	// INP thresholds: good <200, needs-improvement <500
	switch {
	case inpP75 > 500:
		score -= 15
	case inpP75 > 200:
		score -= 7
	}

	// CLS thresholds: good <0.1, needs-improvement <0.25
	switch {
	case clsP75 > 0.25:
		score -= 15
	case clsP75 > 0.1:
		score -= 7
	}

	// Error rate: >5% = 15 penalty; >2% = 7 penalty
	switch {
	case errorRate > 0.05:
		score -= 15
	case errorRate > 0.02:
		score -= 7
	}

	if score < 0 {
		score = 0
	}
	return int(score)
}

// QueryNetworkRollups aggregates network failure data grouped by
// (url_pattern, method, status_code) across the requested time window.
// Only patterns with at least one failure are returned.
func (s *Store) QueryNetworkRollups(
	ctx context.Context,
	projectID, envID string,
	from, to time.Time,
) ([]NetworkRollup, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
		    method,
		    url_pattern,
		    status_code,
		    initiator_type,
		    SUM(request_count)::bigint AS request_count,
		    SUM(failure_count)::bigint AS failure_count,
		    SUM(session_count)::bigint AS session_count,
		    MAX(last_seen_at)::text    AS last_seen_at
		FROM network_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		  AND failure_count > 0
		GROUP BY method, url_pattern, status_code, initiator_type
		ORDER BY failure_count DESC
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query network rollups: %w", err)
	}
	results, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (NetworkRollup, error) {
		var n NetworkRollup
		err := r.Scan(
			&n.Method, &n.URLPattern, &n.StatusCode, &n.InitiatorType,
			&n.RequestCount, &n.FailureCount, &n.SessionCount, &n.LastSeenAt,
		)
		if n.RequestCount > 0 {
			n.FailRate = float64(n.FailureCount) / float64(n.RequestCount)
		}
		return n, err
	})
	return results, err
}

// QueryNavSummary returns the navigation type split (hard vs SPA sessions)
// and timing p75 values for all navigation events in the requested window,
// plus a per-route timing table.
func (s *Store) QueryNavSummary(
	ctx context.Context,
	projectID, envID string,
	from, to time.Time,
) (*NavSummaryResult, error) {
	// Total sessions per nav type.
	typeRows, err := s.pool.Query(ctx, `
		SELECT nav_type, SUM(session_count)::bigint
		FROM navigation_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		  AND route = ''
		GROUP BY nav_type
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query nav type split: %w", err)
	}
	var hardSess, spaSess int64
	for typeRows.Next() {
		var navType string
		var count int64
		if err := typeRows.Scan(&navType, &count); err != nil {
			typeRows.Close()
			return nil, err
		}
		switch navType {
		case "hard":
			hardSess = count
		case "spa":
			spaSess = count
		}
	}
	typeRows.Close()
	if err := typeRows.Err(); err != nil {
		return nil, err
	}

	// Weighted-average timing breakdown across all routes and nav types.
	var timing NavTiming
	timingRow := s.pool.QueryRow(ctx, `
		SELECT
		    COALESCE(AVG(dns_p75),  0),
		    COALESCE(AVG(tcp_p75),  0),
		    COALESCE(AVG(tls_p75),  0),
		    COALESCE(AVG(ttfb_p75), 0),
		    COALESCE(AVG(fcp_p75),  0),
		    COALESCE(AVG(lcp_p75),  0),
		    COALESCE(AVG(dom_p75),  0)
		FROM navigation_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
	`, projectID, envID, from, to)
	if err := timingRow.Scan(
		&timing.DNSP75, &timing.TCPP75, &timing.TLSP75,
		&timing.TTFBP75, &timing.FCPP75, &timing.LCPP75, &timing.DOMP75,
	); err != nil {
		return nil, fmt.Errorf("query nav timing: %w", err)
	}

	// Per-route timing table (exclude the global '' bucket, non-empty routes only).
	routeRows, err := s.pool.Query(ctx, `
		SELECT route,
		       SUM(session_count)::bigint AS sessions,
		       AVG(fcp_p75)              AS fcp_p75,
		       AVG(lcp_p75)              AS lcp_p75,
		       AVG(ttfb_p75)             AS ttfb_p75
		FROM navigation_rollups
		WHERE project_id = $1::uuid AND environment_id = $2::uuid
		  AND period_start >= $3 AND period_start < $4
		  AND route <> ''
		GROUP BY route
		ORDER BY lcp_p75 DESC
	`, projectID, envID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query nav route rows: %w", err)
	}
	navRoutes, err := pgx.CollectRows(routeRows, func(r pgx.CollectableRow) (NavRouteRow, error) {
		var row NavRouteRow
		return row, r.Scan(&row.Route, &row.Sessions, &row.FCPP75, &row.LCPP75, &row.TTFBP75)
	})
	if err != nil {
		return nil, err
	}

	return &NavSummaryResult{
		HardNavSessions: hardSess,
		SPANavSessions:  spaSess,
		TotalSessions:   hardSess + spaSess,
		Timing:          timing,
		Routes:          navRoutes,
	}, nil
}
