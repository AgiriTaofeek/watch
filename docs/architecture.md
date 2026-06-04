# Architecture

## Overview

Watch is designed as a single-organization, self-hosted frontend monitoring system with multiple frontend projects and environments inside one deployment.

```txt
Browser SDK ── Ingestion API ── Postgres raw events
                      │
                      ├── Worker: rollups, grouping, retention
                      ├── Worker: alerts
                      └── Dashboard API ── TanStack Start dashboard
```

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
