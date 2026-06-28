# Architecture

## Overview

Watch is designed as a single-organization, self-hosted frontend monitoring system with multiple frontend projects and environments inside one deployment.

```txt
Browser SDK ── Ingestion API ── Postgres raw events
                      │
                      ├── Worker: rollups, grouping, retention
                      ├── Worker: alerts
                      └── Dashboard API ◄── TanStack Start dashboard ◄── Dashboard browser
                         (internal)         (BFF: SSR + server functions)   (only origin)
```

The dashboard browser talks only to the TanStack Start (Nitro) server, which
renders the first load on the server and runs as a client SPA thereafter. Start
is a backend-for-frontend: it forwards authenticated calls (cookie + CSRF) to the
internal Dashboard API and relays responses. The Dashboard API is not exposed to
the browser directly, so it needs no CORS. See [auth-model.md](auth-model.md) for
the cookie/CSRF flow, [request-lifecycle.md](request-lifecycle.md) for the full
end-to-end walkthrough of a page load, and
[cross-origin-deployment.md](cross-origin-deployment.md) for split-host setups.

## Browser SDK Design

The browser SDK must be stack agnostic at its core.


Core SDK responsibilities:

- Web Vitals collection
- Global JavaScript error capture
- Unhandled promise rejection capture
- Asset and chunk load failure capture
- Browser navigation timing
- Failed `fetch` and `XMLHttpRequest` capture
- Privacy-safe breadcrumb buffer
- Batching, retry, sampling, and redaction

Framework and router integrations should be optional layers on top of the core SDK.

Initial integrations:

- React error boundary integration
- React Router v7 route context integration

Future integrations can add richer context for other stacks without changing the ingestion contract.

## Ingestion API

Public API surface that receives browser events from frontend applications.

Responsibilities:

- Validate project keys
- Enforce origin allowlists
- Apply strict JSON schema validation
- Reject oversized or malformed payloads
- Apply server-side redaction
- Store accepted raw events
- Record dropped-event counters

## Dashboard API

Authenticated API used by the dashboard. Single surface covering both management and read paths.

Management responsibilities:

- Manage users and roles
- Manage projects and environments
- Manage ingestion keys
- Manage retention and redaction settings
- Manage alert rules

Read responsibilities:

- Query issues, Web Vitals, frontend performance, network failures, and releases
- Serve route-level health, affected session counts, and frontend health score
- Serve system health snapshots

## Worker

Background processing service.

Responsibilities:

- Aggregate raw frontend events into rollups
- Group frontend errors into issues
- Enforce retention policies
- Evaluate alert rules
- Deliver alert notifications
- Resolve source maps where available

## Dashboard

TanStack Start application for operational workflows.

Primary screens:

- Overview
- Issues
- Frontend Performance
- Web Vitals
- Network Failures
- Releases
- Alerts
- Settings
- System health

## Repository Layout

```txt
/apps/server        # Go API, ingestion, worker, alerting
/apps/dashboard     # TanStack Start dashboard
/packages/browser   # Browser SDK
/deploy             # Docker Compose and env examples
/docs               # Product, architecture, security, and roadmap docs
```

## Scale Target

V1 should run on a single reasonable VPS.

- 10 frontend projects
- 100k to 1M frontend events per day
- 50 events per ingestion batch
- p95 ingestion response under 100ms
- Rollups every minute
- Dashboard common queries under 2 seconds
- Graceful degradation through sampling or dropping low-priority events

## Known Constraints and Architectural Risks

These are documented architectural limitations that must be understood before
running Watch in production. Each has a resolution path noted.

### Real-time data delay (PRD gap)

The PRD promises "useful data within 1-2 minutes." The current worker only
aggregates the **previous complete hour**, producing a maximum delay of 65
minutes before new events appear in any dashboard chart. Dashboard screens do
not auto-refresh (system health is the exception at 30s).

Resolution path:
1. Run the worker on a shorter interval (60s) and include the current partial
   hour in aggregation — closes the PRD promise with minimal infrastructure
2. Add SSE endpoint + in-process fan-out hub for a live event ticker — see
   [real-time.md](real-time.md) for the full implementation pattern
3. Implement alerts (Milestone 7) so operators do not need the dashboard open
   to be notified of problems

### Single-binary, single-instance only

The rollup worker, login rate limiter, and (if added) alert cooldown state all
live in one process. Scaling horizontally requires:

- A distributed lock (Postgres advisory lock is sufficient) on the worker so
  only one instance runs aggregation at a time
- Moving the login rate limiter to a shared Postgres-backed store
- Ensuring alert deduplication state is DB-backed, not in-memory

Do not run two instances simultaneously until these are in place.

### Worker runs in the web server process

The worker goroutines share the Go runtime and Postgres connection pool with
the HTTP server. A worker task that holds Postgres connections or consumes
significant CPU degrades ingestion and dashboard response times. At v1 scale
this is acceptable. At higher scale, split the worker into a separate binary
with its own pool and resource limits.

### Worker fetches are unbounded

`FetchVitalSamples`, `FetchNavSamples`, `FetchNetworkRequestSamples`, and
`FetchErrorCounts` load an entire hour of events into memory at once. At 1M
events/day the hourly batch is ~40k rows. Add streaming or paginated fetching
before sustained traffic exceeds this.

### Missing index for worker queries

Worker queries `raw_events` on `(event_type, event_timestamp)`. The current
indexes cover `(project_id, received_at)` and `(environment_id, received_at)`.
Worker aggregation queries will do sequential scans as the table grows. Add a
migration with `CREATE INDEX ON raw_events (event_type, event_timestamp)` before
high-traffic deployment.

### No event deduplication

The SDK retries failed batches. There is no client-generated event ID and no
unique constraint on `raw_events` to absorb retries. Duplicate raw events
inflate error counts, session counts, and metric sample populations. Resolution:
add a `sdk_event_id uuid` column to `raw_events` with a unique constraint and
have the SDK generate a stable UUID per event per batch attempt.

### Offset pagination on issues

`ListIssues` uses `OFFSET`/`LIMIT`. Performance degrades as the issues table
grows — a deep page requires scanning all preceding rows. Replace with
cursor-based pagination keyed on `(first_seen_at DESC, id)` before the issues
table reaches tens of thousands of rows.

### No server-side sampling

Every ingested event is stored. There is no server-side sampling rate. For
apps above 1M events/day, add configurable head-based sampling: store 100%
of `frontend_error` events, but only N% of `web_vital`, `navigation`, and
`network_request` events. Rollup math must account for the sampling factor.
