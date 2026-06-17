-- Sessions for dashboard user authentication.
CREATE TABLE sessions (
  id         text PRIMARY KEY,              -- crypto/rand 32-byte hex token
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  csrf_token text NOT NULL                  -- returned to the dashboard JS; required on mutations
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
