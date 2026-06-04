# Roadmap

## Milestone 1: Ingestion Spine

- Go server app
- Postgres schema
- Foundational tables: `organizations`, `users`, `projects`, `environments`, `ingestion_keys`, `raw_events`, `dropped_event_counters`
- Project and environment model
- Project-scoped browser ingestion keys
- Strict event validation
- Raw event storage
- Dropped-event counters
- Local user accounts
- Password hashing (Argon2id)
- Secure session cookies
- CSRF protection for mutations
- Roles: `owner`, `admin`, `member`, `viewer`
- Docker Compose setup

## Milestone 2: Browser SDK Core

- Web Vitals collection
- Frontend error capture
- Unhandled promise rejection capture
- Privacy-safe breadcrumb ring buffer
- Manual `addBreadcrumb` API
- Batching
- Retry behavior
- Redaction defaults
- `beforeSend(event)` hook
- Privacy test suite for default collection behavior
- Framework-agnostic browser SDK sample page
- Traditional multi-page app sample
- React Router v7 SPA sample

## Milestone 3: Navigation And Network Instrumentation

- Framework-agnostic page context
- Browser navigation timing
- Client-side navigation timing through optional router integrations
- Failed `fetch` capture
- Failed `XMLHttpRequest` capture
- Asset load failure capture
- Chunk load/version mismatch detection
- Breadcrumb capture for navigation, network failures, asset failures, console errors, and release changes
- Optional browser-observed request timing
- Release and environment metadata

## Milestone 4: First Framework Integrations

- React error boundary integration
- React Router v7 route context integration
- Integration API for future adapters
- Adapter documentation for other frontend stacks

## Milestone 5: Rollups And Issues

- Aggregation worker
- Frontend error grouping
- Route-level health rollups
- User impact counters
- Frontend health score (v1 formula TBD)
- Issue status: `open`, `resolved`, `ignored`
- Raw event retention
- Metric rollups

## Milestone 6: Dashboard

- Overview screen
- Issues screen
- Error sample breadcrumb timeline
- Frontend performance screen
- Web Vitals screen
- Network failures screen
- Asset and chunk failures screen
- Route health view
- Settings screen
- System health screen

## Milestone 7: Alerts

- SMTP alert delivery
- Generic signed webhook delivery
- Alert rule engine
- Alert cooldown and deduplication
- Recovery notifications
- Chunk load failure spike alerts

## Milestone 8: Releases And Source Maps

- Release API
- Deployment events
- Source map upload
- Private artifact storage
- Stack trace resolution
- Before/after release comparison

## Main Risk

The project fails if it becomes too broad too early.

The v1 focus must remain frontend production health monitoring: JavaScript errors, framework render crashes where integrations are installed, Web Vitals, page/navigation performance, failed network requests, asset/chunk failures, privacy-safe breadcrumbs, releases, and alerts.
