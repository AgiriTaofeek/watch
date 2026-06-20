// Domain types mirroring the Go store structs. Field names match the JSON
// tags in the server exactly so responses can be decoded without a mapping step.

export type User = {
  id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
}

export type Project = {
  id: string
  name: string
  slug: string
  allowed_origins: string[]
  created_at: string
}

export type Environment = {
  id: string
  name: string
  created_at: string
}

export type IngestionKey = {
  id: string
  public_key: string
  created_at: string
  revoked_at: string | null
}

export type EnvironmentDetail = Environment & {
  keys: IngestionKey[]
}

export type ProjectDetail = Project & {
  environments: EnvironmentDetail[]
}

export type IssueStatus = "open" | "resolved" | "ignored"

export type Issue = {
  id: string
  project_id: string
  environment_id: string
  fingerprint: string
  title: string
  culprit: string | null
  status: IssueStatus
  first_seen_at: string
  last_seen_at: string
  event_count: number
  user_count: number
  created_at: string
  updated_at: string
}

export type ErrorBucket = {
  period_start: string
  error_count: number
  session_count: number
}

export type VitalMetric = "LCP" | "CLS" | "INP" | "FCP" | "TTFB"

export type VitalBucket = {
  period_start: string
  p75: number
  mean: number
  sample_count: number
  health_score: number
}
