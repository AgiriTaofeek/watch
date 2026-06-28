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
- **[gap]** Dockerfile for the Go server — required for the `docker compose up -d` success criterion; without it the project cannot be deployed
- **[gap]** Ingest API documentation — the SDK/server contract must be written before external callers can integrate reliably
- **[gap]** Per-key ingest rate limiting — a buggy SDK or stolen key can flood Postgres and take down the host; must exist before any public deployment

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
- **[gap]** Per-event-type sampling configuration — `sampleRate: { network_request: 0.1, web_vital: 1.0 }` lets operators control storage volume without server config changes; critical before high-traffic deployments

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
- **[gap]** `console.log` and `console.warn` breadcrumbs — capturing all console levels (not just errors) gives a richer activity trail before crashes; operators should be able to opt in per level

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
- **[gap]** Define and implement the health score formula — PRD lists this as TBD; must be resolved before M6 dashboard ships or the score widget has no meaning
- **[gap]** Real-time rollup interval — the worker currently aggregates only the previous complete hour, producing up to a 65-minute delay; the PRD promises 1–2 minutes; fix by running aggregation on a short interval (60s) over a sliding window that includes the current partial hour
- **[gap]** Worker graceful shutdown — goroutines must drain their current batch before the process exits; mid-batch abandonment produces inconsistent rollup state (see `docs/go-architecture.md`)
- **[gap]** Add composite index `(event_type, event_timestamp)` on `raw_events` — worker queries scan this combination; missing index causes sequential table scans as event volume grows

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
- i18n infrastructure via Paraglide JS (English only in M6; second locale and
  locale switcher UI deferred until strings are stable)
- **[gap]** Error search with query input — when the issues list reaches hundreds of entries, a status dropdown is not enough; operators need to filter by error message substring, affected route, and event type at minimum; implement as `field:value` filter syntax backed by SQL `LIKE`/`=` conditions
- **[gap]** User-centric issue drilldown — `userIdHash` is already collected; add a view that answers "which users were affected by this issue" and "show all issues affecting a given user hash"; the raw data exists, only the dashboard surface is missing
- **[gap]** RBAC enforcement — roles are stored but per-route authorization is not wired; any authenticated session can currently perform any mutation; enforce before allowing non-owner accounts

## Milestone 7: Alerts

- SMTP alert delivery
- Generic signed webhook delivery
- Alert rule engine
- Alert cooldown and deduplication
- Recovery notifications
- Chunk load failure spike alerts
- **[gap]** Webhook custom auth headers — operators need to authenticate incoming webhooks to their internal receivers (e.g., `Authorization: Bearer <token>`); without this, webhooks are only usable behind a private network
- **[gap]** Per-alert-type payload schema — define and document the JSON shape for each alert type (error spike, vital threshold, network spike, chunk failure) so webhook receivers and Slack bots can parse without custom glue code

## Milestone 8: Releases And Source Maps

- Release API
- Deployment events
- Source map upload
- Private artifact storage
- Stack trace resolution
- Before/after release comparison

## Milestone 9: Framework Integrations Expansion

Additional framework integrations beyond the M4 React baseline. Priority order reflects ecosystem size and operator demand.

- **Next.js integration** — most common React deployment target; the M4 React integration does not cover server components, edge runtime errors, or Next.js routing conventions
- **Vue integration** — large existing install base; core SDK is already framework-agnostic so the integration is primarily route context and error boundary glue
- **SvelteKit integration** — fast-growing; routing pattern is similar to React Router v7
- Integration guide updates for each new adapter

## Milestone Review And Refactoring

After each milestone is complete and working end to end, pause for a focused
refactoring pass before expanding the product surface.

The goal is not to rewrite for aesthetics. The goal is to compare the code we
just shipped against strong production Go codebases, extract practical lessons,
and upgrade both the Watch codebase and our Go mental model.

Reference projects to study during these passes:

- Caddy — server lifecycle, configuration, modules, and operational polish
- PocketBase — small-product architecture, embedded app shape, and pragmatic Go
  APIs
- MinIO — storage-heavy service design, reliability patterns, and production
  discipline
- Traefik — HTTP routing, middleware composition, observability, and deployment
  ergonomics

Each review should produce small, deliberate follow-up changes:

- simpler package boundaries
- clearer dependency ownership
- better shutdown and lifecycle handling
- sharper error handling and logging
- stronger tests around the milestone's critical paths
- documentation updates that capture what was learned

## Deliberate Non-Goals

These features are explicitly out of scope for v1 and the near-term roadmap.
They are listed here so the boundary stays visible as pressure to expand grows.

- **Session replay / DOM recording** — requires storing DOM snapshots and keystroke data; incompatible with the privacy-first positioning for regulated industries and the single-VPS operational target
- **Distributed tracing** — backend span collection and OTLP ingestion; Watch is a frontend monitor; backend APM is a separate problem with a different operational profile
- **Log aggregation from servers** — general-purpose log management (Loki, Elasticsearch) is out of scope; Watch captures browser-side console breadcrumbs only
- **Heatmaps and click maps** — requires session-level DOM interaction data; same privacy and storage concerns as session replay
- **Custom dashboard builder** — fixed screens are sufficient for v1; a query/widget builder adds significant product and engineering surface for unclear early benefit
- **AI-generated summaries** — deferred until the core monitoring product is proven; adds infrastructure cost and external data-sharing concerns for self-hosted deployments
- **SaaS multi-tenancy** — single-organization self-hosted is the design constraint; multi-tenant billing, isolation, and compliance are a different product

## Main Risk

The project fails if it becomes too broad too early.

The v1 focus must remain frontend production health monitoring: JavaScript errors, framework render crashes where integrations are installed, Web Vitals, page/navigation performance, failed network requests, asset/chunk failures, privacy-safe breadcrumbs, releases, and alerts.
