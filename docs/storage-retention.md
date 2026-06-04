# Storage And Retention

## Database

V1 uses Postgres only.

This keeps the self-hosted deployment simple and makes backup, restore, and security review easier.

## Storage Strategy

Watch stores raw events for short-term debugging and rollups for longer-term analysis.

Suggested tables, annotated with the milestone that introduces them:

- Organizations or deployment settings (M1)
- Users (M1)
- Projects (M1)
- Environments (M1)
- Ingestion keys (M1)
- Raw events (M1)
- Dropped-event counters (M1)
- Metric rollups (M5)
- Error issues (M5)
- Issue samples (M5)
- Network request samples (M5)
- Asset load failure samples (M5)
- Breadcrumb samples attached to error events (M5)
- Route health rollups (M5)
- Alert rules (M7)
- Alert deliveries (M7)
- Releases (M8)
- Source map artifacts (M8)
- Audit logs (M1)
- System health snapshots (M6)

## Default Retention

```txt
Raw events:          14 days
Metric rollups:      90 days
Audit/security logs: 180 days
Issue summaries:     retained until deleted
```

Retention should be configurable by deployment and project.

## Rollups

Workers should aggregate raw events into minute, hour, and day rollups.

Rollups should support frontend health views:

- Frontend error rate
- Framework render crash rate where available
- Network failure rate
- Asset/chunk failure rate
- Frontend-observed request timing where enabled
- Web Vital good/needs-improvement/poor counts
- Page and client-side navigation timing
- Affected session counts
- Frontend health score (v1 formula TBD; see [glossary.md](glossary.md))
- Alert threshold evaluation

## Sampling

These percentages describe what the SDK transmits and Watch retains, not what the browser observes. The SDK observes all signals; sampling controls which are emitted to the ingestion API and stored.

Defaults:

- Errors: 100%
- Framework integration render crashes: 100%
- Asset/chunk load failures: 100%
- Deployment events: 100%
- Web Vitals: 100% for low traffic, configurable later
- Navigation events: sampled by default
- Successful network requests: sampled or disabled by default
- Failed network requests: 100%
- Console errors: disabled or sampled by default
- Breadcrumbs: kept in memory and attached to errors by default

Sampling rates must be visible in the dashboard.
