DROP INDEX IF EXISTS idx_vital_rollups_lookup;
DROP TABLE IF EXISTS vital_rollups;

DROP INDEX IF EXISTS idx_error_rollups_lookup;
DROP TABLE IF EXISTS error_rollups;

DROP INDEX IF EXISTS idx_raw_events_unprocessed;
ALTER TABLE raw_events DROP COLUMN IF EXISTS issue_id;

DROP INDEX IF EXISTS idx_issues_open;
DROP INDEX IF EXISTS idx_issues_project_env_time;
DROP TABLE IF EXISTS issues;

DROP TYPE IF EXISTS issue_status;
