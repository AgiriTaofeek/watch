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

export type RouteSummary = {
  route: string
  sessions: number
  errors: number
  error_rate: number
  lcp_p75: number
  inp_p75: number
  fcp_p75: number
  cls_p75: number
  ttfb_p75: number
  health_score: number
}

export type RouteHealthResult = {
  routes: RouteSummary[]
  overall_health: number
  route_count: number
  poor_health_count: number
  avg_error_rate: number
}

export type NetworkFailure = {
  method: string
  url_pattern: string
  status_code: number
  initiator_type: string
  request_count: number
  failure_count: number
  session_count: number
  fail_rate: number
  last_seen_at: string
}

export type NavTiming = {
  dns_p75: number
  tcp_p75: number
  tls_p75: number
  ttfb_p75: number
  fcp_p75: number
  lcp_p75: number
  dom_p75: number
}

export type NavRouteRow = {
  route: string
  sessions: number
  fcp_p75: number
  lcp_p75: number
  ttfb_p75: number
}

export type NavSummaryResult = {
  hard_nav_sessions: number
  spa_nav_sessions: number
  total_sessions: number
  timing: NavTiming
  routes: NavRouteRow[]
}

export type SystemHealth = {
  ingestion: {
    status: string
    events_per_min: number
    avg_latency_ms: number
    uptime_pct: number
  }
  worker: {
    status: string
    queue_depth: number
    rollups_today: number
    last_run_at: string
  }
  database: {
    status: string
    connections: number
    idle: number
    max: number
  }
  server: {
    version: string
    go_version: string
    uptime_seconds: number
    uptime_human: string
  }
}
