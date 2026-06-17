-- Lifecycle states for a grouped error issue.
CREATE TYPE issue_status AS ENUM ('open', 'resolved', 'ignored');

-- A grouped set of frontend_error events that share the same fingerprint.
-- One row per unique (project, environment, fingerprint) triple.
CREATE TABLE issues (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid         NOT NULL REFERENCES projects (id)     ON DELETE CASCADE,
  environment_id  uuid         NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  fingerprint     text         NOT NULL,
  title           text         NOT NULL,    -- human-readable: "TypeError: Cannot read..."
  culprit         text,                     -- route pattern where the error most often occurs
  status          issue_status NOT NULL DEFAULT 'open',
  first_seen_at   timestamptz  NOT NULL DEFAULT now(),
  last_seen_at    timestamptz  NOT NULL DEFAULT now(),
  event_count     bigint       NOT NULL DEFAULT 1,
  user_count      bigint       NOT NULL DEFAULT 0,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (project_id, environment_id, fingerprint)
);

-- Distinct affected users per issue. Keeping this as a separate relation makes
-- issues.user_count a true unique-user count instead of "events with a user id".
CREATE TABLE issue_users (
  issue_id      uuid        NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
  user_id_hash  text        NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, user_id_hash)
);

-- Hot query: "open issues for this project, newest first".
CREATE INDEX idx_issues_project_env_time ON issues (project_id, environment_id, last_seen_at DESC);
-- Dashboard filter: open issues only (partial index keeps it small).
CREATE INDEX idx_issues_open ON issues (project_id, environment_id) WHERE status = 'open';

-- Link each frontend_error raw event to the issue it was classified into.
-- NULL means the worker has not yet processed this event.
ALTER TABLE raw_events ADD COLUMN issue_id uuid REFERENCES issues (id) ON DELETE SET NULL;

-- Partial index the worker scans every 30 s: only unclassified error events.
CREATE INDEX idx_raw_events_unprocessed
  ON raw_events (project_id, received_at)
  WHERE issue_id IS NULL AND event_type = 'frontend_error';

-- Hourly error counts per (project, environment, route, release).
-- Populated by the rollup aggregator worker loop.
CREATE TABLE error_rollups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects (id)     ON DELETE CASCADE,
  environment_id  uuid        NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  route           text        NOT NULL DEFAULT '',  -- empty string = no route context
  release         text,
  period_start    timestamptz NOT NULL,
  error_count     bigint      NOT NULL DEFAULT 0,
  session_count   bigint      NOT NULL DEFAULT 0,
  -- NULLS NOT DISTINCT so (project, env, '', NULL, period) conflicts correctly.
  UNIQUE (project_id, environment_id, route, release, period_start) NULLS NOT DISTINCT
);

CREATE INDEX idx_error_rollups_lookup ON error_rollups (project_id, environment_id, period_start DESC);

-- Hourly Web Vitals per (project, environment, route, release, metric).
-- Stores count + sum for mean, plus up to 200 raw samples for p75 approximation.
CREATE TABLE vital_rollups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects (id)     ON DELETE CASCADE,
  environment_id  uuid        NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  route           text        NOT NULL DEFAULT '',
  release         text,
  period_start    timestamptz NOT NULL,
  metric_name     text        NOT NULL,   -- 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'
  sample_count    bigint      NOT NULL DEFAULT 0,
  sum_value       float       NOT NULL DEFAULT 0,
  samples         float[]     NOT NULL DEFAULT '{}',
  UNIQUE (project_id, environment_id, route, release, period_start, metric_name) NULLS NOT DISTINCT
);

CREATE INDEX idx_vital_rollups_lookup ON vital_rollups (project_id, environment_id, period_start DESC);
