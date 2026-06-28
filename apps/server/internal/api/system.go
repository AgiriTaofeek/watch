package api

import (
	"fmt"
	"net/http"
	"runtime"
	"time"
)

func (a *API) handleGetSystemHealth(w http.ResponseWriter, r *http.Request) {
	uptime := time.Since(a.startTime)
	db := a.store.SystemHealthStats()

	dbStatus := "healthy"
	if db.TotalConns == 0 {
		dbStatus = "degraded"
	} else if db.MaxConns > 0 && float64(db.TotalConns)/float64(db.MaxConns) > 0.85 {
		dbStatus = "elevated"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ingestion": map[string]any{
			"status":         "healthy",
			"events_per_min": 0,
			"avg_latency_ms": 0,
			"uptime_pct":     100.0,
		},
		"worker": map[string]any{
			"status":        "healthy",
			"queue_depth":   0,
			"rollups_today": 0,
			"last_run_at":   time.Now().UTC().Truncate(time.Hour).Format(time.RFC3339),
		},
		"database": map[string]any{
			"status":      dbStatus,
			"connections": db.TotalConns,
			"idle":        db.IdleConns,
			"max":         db.MaxConns,
		},
		"server": map[string]any{
			"version":         "0.0.0",
			"go_version":      runtime.Version(),
			"uptime_seconds":  int64(uptime.Seconds()),
			"uptime_human":    formatUptime(uptime),
		},
	})
}

func formatUptime(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	switch {
	case days > 0:
		return fmt.Sprintf("%dd %dh", days, hours)
	case hours > 0:
		return fmt.Sprintf("%dh %dm", hours, minutes)
	default:
		return fmt.Sprintf("%dm", minutes)
	}
}
