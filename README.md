# Watch

Watch is a privacy-first, self-hosted production health monitor for frontend web applications.

The goal is to give engineering teams frontend production visibility across web stacks without sending telemetry to third-party vendors.

The backend APIs that monitored frontends communicate with may already be monitored by tools like Grafana. Watch v1 focuses on the browser/frontend only.

## V1 Promise

Watch tracks the frontend production signals needed to discover and fix real user issues:

- Frontend Web Vitals
- Frontend JavaScript errors
- Unhandled promise rejections
- Framework-specific render crashes where integrations are installed
- Page and client-side navigation performance
- Failed frontend network requests
- Asset and chunk load failures
- Route-level health and affected session counts
- Privacy-safe breadcrumbs before errors
- Optional browser-observed request timing
- Release/deploy markers
- Email and generic webhook alerts

## V1 Non-Goals

Watch is not trying to become Sentry, PostHog, and Datadog at once.

V1 intentionally excludes:

- Backend/API monitoring
- Backend errors, panics, and server request latency
- Session replay
- DOM recording or screen recording
- Heatmaps
- Product analytics and funnels
- General-purpose log management
- Distributed tracing
- SaaS-style multi-tenancy
- Custom dashboard builders

## Planned Stack

- Go for ingestion, API, workers, and alerting
- Postgres for raw events, rollups, projects, users, alerts, and settings
- TanStack Start, React, and TypeScript for the dashboard
- TypeScript browser SDK core that works with any frontend stack
- Optional browser SDK integrations, starting with React and React Router v7
- Docker Compose for the first self-hosted deployment path

## Repository Shape

```txt
/apps/server        # Go API, ingestion, worker, alerting
/apps/dashboard     # TanStack Start dashboard
/packages/browser   # Browser SDK
/packages/contracts # Shared TypeScript types (event envelope, etc.)
/deploy             # Docker Compose and env examples
/docs               # Product, architecture, security, and roadmap docs
```

## Documents

- [Product Requirements](docs/prd.md)
- [How Watch Works](docs/how-watch-works.md)
- [Architecture](docs/architecture.md)
- [Auth Model](docs/auth-model.md)
- [Security And Privacy](docs/security-privacy.md)
- [Threat Model](docs/threat-model.md)
- [Event Taxonomy](docs/event-taxonomy.md)
- [Storage And Retention](docs/storage-retention.md)
- [Glossary](docs/glossary.md)
- [Monorepo Setup](docs/monorepo-setup.md)
- [Monorepo Concepts](docs/monorepo-concepts.md)
- [Milestone 1: Ingestion Spine](docs/milestone-1/)
- [Data Modeling Framework](docs/data-modeling-framework.md)
- [Roadmap](docs/roadmap.md)
