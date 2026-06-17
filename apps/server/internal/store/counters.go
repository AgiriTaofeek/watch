package store

import (
	"context"
	"fmt"
	"time"
)

// IncrementDroppedCounter upserts a per-day dropped-event count for the given
// reason. environmentID may be nil when the key was unknown and no environment
// can be attributed (the NULLS NOT DISTINCT index handles nil collisions).
func (s *Store) IncrementDroppedCounter(ctx context.Context, environmentID *string, reason string, day time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO dropped_event_counters (environment_id, reason, day, count)
		VALUES ($1::uuid, $2::drop_reason, $3::date, 1)
		ON CONFLICT (environment_id, reason, day) DO UPDATE
		    SET count = dropped_event_counters.count + 1
	`, environmentID, reason, day)
	if err != nil {
		return fmt.Errorf("increment dropped counter: %w", err)
	}
	return nil
}
