package api

import (
	"net/http"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

// Web Vitals rating thresholds (milliseconds / unitless) per Google's definitions.
// Used to compute the per-bucket health score penalty.
var vitalThresholds = map[string][2]float64{
	// [needs-improvement, poor]
	"LCP":  {2500, 4000},
	"INP":  {200, 500},
	"CLS":  {0.1, 0.25},
	"FCP":  {1800, 3000},
	"TTFB": {800, 1800},
}

func (a *API) handleGetErrorRollups(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if !validUUID(projectID) {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}

	q := r.URL.Query()
	envID := q.Get("environment_id")
	if !validUUID(envID) {
		writeError(w, http.StatusBadRequest, "environment_id query param is required and must be a UUID")
		return
	}

	from, to, ok := parseTimeRange(w, q)
	if !ok {
		return
	}

	buckets, err := a.store.QueryErrorRollups(r.Context(), projectID, envID, from, to)
	if err != nil {
		a.serverError(w, r, err, "could not query error rollups")
		return
	}
	if buckets == nil {
		buckets = []store.ErrorRollup{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"buckets": buckets})
}

func (a *API) handleGetVitalRollups(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if !validUUID(projectID) {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}

	q := r.URL.Query()
	envID := q.Get("environment_id")
	if !validUUID(envID) {
		writeError(w, http.StatusBadRequest, "environment_id query param is required and must be a UUID")
		return
	}

	metric := q.Get("metric")
	switch metric {
	case "LCP", "CLS", "INP", "FCP", "TTFB":
	default:
		writeError(w, http.StatusBadRequest, "metric must be one of: LCP, CLS, INP, FCP, TTFB")
		return
	}

	from, to, ok := parseTimeRange(w, q)
	if !ok {
		return
	}

	buckets, err := a.store.QueryVitalRollups(r.Context(), projectID, envID, metric, from, to)
	if err != nil {
		a.serverError(w, r, err, "could not query vital rollups")
		return
	}

	// Attach health score to each bucket based on p75 vs thresholds.
	type enriched struct {
		PeriodStart string  `json:"period_start"`
		P75         float64 `json:"p75"`
		Mean        float64 `json:"mean"`
		SampleCount int64   `json:"sample_count"`
		HealthScore float64 `json:"health_score"`
	}
	result := make([]enriched, 0, len(buckets))
	for _, b := range buckets {
		score := 100.0
		if thresh, ok := vitalThresholds[metric]; ok {
			if b.P75 > thresh[1] {
				score -= 10
			} else if b.P75 > thresh[0] {
				score -= 5
			}
		}
		result = append(result, enriched{
			PeriodStart: b.PeriodStart,
			P75:         b.P75,
			Mean:        b.Mean,
			SampleCount: b.SampleCount,
			HealthScore: score,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"metric": metric, "buckets": result})
}

// parseTimeRange parses ?from= and ?to= RFC3339 query params.
// Defaults: from = 24 h ago, to = now. Returns false and writes an error on
// invalid input.
func parseTimeRange(w http.ResponseWriter, q interface{ Get(string) string }) (time.Time, time.Time, bool) {
	now := time.Now().UTC()
	from := now.Add(-24 * time.Hour)
	to := now

	if s := q.Get("from"); s != "" {
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "from must be RFC3339 (e.g. 2006-01-02T15:04:05Z)")
			return time.Time{}, time.Time{}, false
		}
		from = t
	}
	if s := q.Get("to"); s != "" {
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "to must be RFC3339 (e.g. 2006-01-02T15:04:05Z)")
			return time.Time{}, time.Time{}, false
		}
		to = t
	}
	if !from.Before(to) {
		writeError(w, http.StatusBadRequest, "from must be before to")
		return time.Time{}, time.Time{}, false
	}
	return from, to, true
}
