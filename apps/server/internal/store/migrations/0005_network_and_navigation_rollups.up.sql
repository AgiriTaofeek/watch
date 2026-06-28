-- Hourly failed network request counts per (project, env, url_pattern, method, status_code).
-- Populated by the rollup aggregator once it processes network_request events.
CREATE TABLE network_rollups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects (id)     ON DELETE CASCADE,
  environment_id  uuid        NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  url_pattern     text        NOT NULL DEFAULT '',
  method          text        NOT NULL DEFAULT '',
  status_code     int         NOT NULL DEFAULT 0,
  initiator_type  text        NOT NULL DEFAULT '',  -- 'fetch' | 'xhr' | 'script' | 'img' | 'css'
  period_start    timestamptz NOT NULL,
  request_count   bigint      NOT NULL DEFAULT 0,
  failure_count   bigint      NOT NULL DEFAULT 0,
  session_count   bigint      NOT NULL DEFAULT 0,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, environment_id, url_pattern, method, status_code, period_start)
);
CREATE INDEX idx_network_rollups_lookup ON network_rollups (project_id, environment_id, period_start DESC);

-- Hourly navigation timing p75 values per (project, env, route, nav_type).
-- nav_type is 'hard', 'spa', or '' (both combined). Populated by the rollup
-- aggregator once it processes navigation events.
CREATE TABLE navigation_rollups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects (id)     ON DELETE CASCADE,
  environment_id  uuid        NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  route           text        NOT NULL DEFAULT '',
  nav_type        text        NOT NULL DEFAULT '',  -- 'hard' | 'spa' | '' (all)
  period_start    timestamptz NOT NULL,
  session_count   bigint      NOT NULL DEFAULT 0,
  dns_p75         float       NOT NULL DEFAULT 0,
  tcp_p75         float       NOT NULL DEFAULT 0,
  tls_p75         float       NOT NULL DEFAULT 0,
  ttfb_p75        float       NOT NULL DEFAULT 0,
  fcp_p75         float       NOT NULL DEFAULT 0,
  lcp_p75         float       NOT NULL DEFAULT 0,
  dom_p75         float       NOT NULL DEFAULT 0,
  UNIQUE NULLS NOT DISTINCT (project_id, environment_id, route, nav_type, period_start)
);
CREATE INDEX idx_navigation_rollups_lookup ON navigation_rollups (project_id, environment_id, period_start DESC);
