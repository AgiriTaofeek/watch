-- Clears all analytics/metrics data while keeping org, users, projects,
-- environments, and ingestion keys intact. Run before re-seeding.
TRUNCATE
  error_rollups,
  vital_rollups,
  network_rollups,
  navigation_rollups,
  issues,
  issue_users,
  raw_events,
  dropped_event_counters
RESTART IDENTITY CASCADE;
