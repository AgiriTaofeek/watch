// Package stats provides small statistical helpers shared across the store and
// worker packages. Functions here are pure (no I/O, no global state) and are
// safe to call from any goroutine.
package stats

import (
	"math"
	"slices"
)

// P75 returns the 75th-percentile value from a slice of floats using the
// nearest-rank method. Returns 0 for an empty slice. The input slice is not
// modified.
func P75(samples []float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sorted := make([]float64, len(samples))
	copy(sorted, samples)
	slices.Sort(sorted)
	idx := int(math.Ceil(0.75*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	return sorted[idx]
}
