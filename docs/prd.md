# Product Requirements

## Problem

Financial frontend applications need production monitoring, but third-party monitoring tools can conflict with privacy, data residency, and security requirements.

Watch provides self-hosted frontend production health monitoring so teams can detect and fix real user issues while keeping telemetry inside infrastructure they control.

The backend APIs that monitored frontends communicate with may already be monitored separately by tools like Grafana. V1 is focused on browser/frontend monitoring only.

## V1 Product Promise

A privacy-first, self-hosted production health monitor for frontend web applications: Web Vitals, JavaScript errors, framework render crashes where integrations are installed, page/navigation performance, asset failures, failed network requests, privacy-safe breadcrumbs, releases, and alerts.

## Users

- Engineering teams responsible for production frontend applications
- CTOs and security reviewers who need confidence that telemetry stays internal
- Frontend developers who need fast feedback after deploys

## V1 Scope

- Browser Web Vitals: `LCP`, `CLS`, `INP`, `FCP`, `TTFB`
- Frontend JavaScript errors
- Unhandled promise rejections
- Framework-agnostic browser SDK core
- Optional framework/router integrations, starting with React error boundaries and React Router v7
- Page and client-side route/navigation context
- Client-side route/page performance for SPAs and traditional multi-page apps
- Failed frontend network requests from `fetch` and `XMLHttpRequest`
- Asset load failures for scripts, chunks, stylesheets, images, and fonts
- Chunk load/version mismatch detection after deploys
- Route-level health by errors, Web Vitals, navigation timing, network failures, and release
- User impact counters for affected sessions and optional affected `userIdHash` values
- Privacy-safe breadcrumbs for route changes, failed network requests, asset failures, console errors, deploy/version changes, and manual app events
- Frontend health score per project, route, and release (v1 formula TBD)
- Optional console error capture, disabled or sampled by default
- Optional lightweight API call timing from the browser perspective
- SMTP email alerts
- Generic signed webhook alerts
- Release/deploy tracking
- Optional source map upload
- Dashboard screens for overview, issues, frontend performance, Web Vitals, network failures, releases, alerts, settings, and system health
- Raw event retention and metric rollups
- Self-monitoring for ingestion, worker, database, and alert health
- Single-organization deployment (no SaaS-style multi-tenancy)
- Local dashboard authentication with roles (`owner`, `admin`, `member`, `viewer`)

## V1 Non-Goals

- Backend/API monitoring
- Backend errors, panics, and server request latency
- Session replay
- DOM recording or screen recording
- Heatmaps
- Product analytics and funnels
- General-purpose log management
- Distributed tracing
- SaaS-style multi-tenancy
- Slack, Teams, or Discord-specific integrations
- Custom dashboard builder

## Success Criteria

- A fresh server can run Watch with `docker compose up -d`.
- The browser SDK reports Web Vitals and JavaScript errors.
- React error boundaries can report render crashes with component stack traces when the React integration is installed.
- The browser SDK reports page/navigation context and failed network requests.
- The browser SDK reports asset/chunk load failures after broken frontend deploys.
- Error samples include privacy-safe breadcrumbs for recent frontend activity.
- The dashboard shows useful frontend production data within 1-2 minutes.
- Alerts fire for frontend error spikes, poor Web Vitals, and network failure spikes.
- Alerts fire for chunk load failure spikes.
- Sensitive data is not stored by default.
- Privacy tests prove cookies, storage, form fields, and request bodies are not collected by default.
- Retention jobs delete old raw events.
- Source maps resolve at least one minified frontend stack trace.
- System health shows ingestion, worker, database, and alert status.
- A developer can identify a bad frontend release from the dashboard.
