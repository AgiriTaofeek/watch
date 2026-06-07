-- Enum types for the fixed-value columns.
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TYPE event_type AS ENUM (
  'web_vital',
  'frontend_error',
  'network_request',
  'navigation',
  'asset_load',
  'breadcrumb',
  'deployment'
);

CREATE TYPE drop_reason AS ENUM (
  'unknown_key',
  'revoked_key',
  'invalid_schema',
  'oversized_payload',
  'rate_limited',
  'blocked_origin'
);

-- The single organization per deployment (plumbing for future multi-org).
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Humans who log into the dashboard.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text, -- Argon2id output; NULL until set by the user.
  display_name text,
  role user_role NOT NULL,
  external_subject_id text, -- reserved for future OIDC / trusted-header auth
  auth_provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (organization_id, email)
);

-- One monitored frontend application.
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

-- A deployment target of a project (production, staging, ...).
CREATE TABLE environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);


-- The public key the SDK uses to authenticate ingestion.
CREATE TABLE ingestion_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE, -- UNIQUE creates the lookup index
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz -- NULL while active; set on revoke
);

-- Every accepted event, stored verbatim. The bedrock table.
CREATE TABLE raw_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_key_id uuid NOT NULL REFERENCES ingestion_keys (id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE, --denormalized
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE, --denormalized
  event_type event_type NOT NULL,
  release text,
  event_timestamp timestamptz NOT NULL, -- when it happened on the client
  received_at timestamptz NOT NULL DEFAULT now(), -- when the server accepted it
  payload jsonb NOT NULL
);

-- The hot query paths: "events for this project/environment, newest first".
CREATE INDEX idx_raw_events_project_received ON raw_events (project_id, received_at DESC);
CREATE INDEX idx_raw_events_environment_received ON raw_events (environment_id, received_at DESC);

-- Per-day counts of received events, grouped by reason.
CREATE TABLE dropped_event_counters(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid REFERENCES environments (id) ON DELETE CASCADE, -- NULL when the key was unknown
  reason drop_reason NOT NULL,
  day date NOT NULL,
  count bigint NOT NULL DEFAULT 0
);

-- The target of Task 8's INSERT ... ON CONFLICT upsert. NULLS NOT DISTINCT
-- (Postgres 15+) makes rows with a NULL environment_id collide as expected.
CREATE UNIQUE INDEX idx_dropped_counters_unique
    ON dropped_event_counters (environment_id, reason, day) NULLS NOT DISTINCT;
