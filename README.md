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

## Users, Teams, and Projects

Watch is a single-organization deployment. One running instance serves one engineering team. There is no SaaS-style multi-tenancy.

**First-run setup** — When a fresh Watch instance starts with no users, visiting the dashboard opens a one-time owner-creation screen. The first person sets their email, a password, and an organization name. The setup endpoint returns `409` once any user exists, so it runs exactly once per deployment.

**Multiple projects** — A deployment can host as many projects as the team needs. Each project tracks one frontend application independently. An organization might run three projects side by side:

```
Organization: Acme Financial
├── Project: Customer Portal       (production, staging)
├── Project: Admin Dashboard       (production)
└── Project: Marketing Site        (production, staging)
```

Each project gets its own environments, ingestion keys, issues, rollups, health scores, and alert rules. Environments keep staging traffic out of production data.

**Roles** — Every dashboard user holds one role across all projects. Access is org-wide: all users can see all projects; the role controls what they can do, not which projects they can reach.

| Role | What they can do |
|------|----------------|
| `owner` | Full control. Created once during setup. |
| `admin` | Create and manage projects, rotate ingestion keys, invite and manage users, configure settings. |
| `member` | View all projects, issues, performance data. Manage alert rules. Cannot manage users or rotate keys. |
| `viewer` | Read-only access across all projects. Good for stakeholders. |

**Inviting team members** — After setup, the owner or an admin invites colleagues from Settings → Users. They pick a role, then either send an invite email (requires SMTP, already configured for alerts) or copy a one-time invite link valid for 72 hours. The invited user clicks the link, sets a display name and password, and lands directly in the dashboard. They skip the first-run wizard because the organization, projects, and data already exist.

See [docs/auth-model.md](docs/auth-model.md) for the full auth design including the invite flow, CSRF protection, and future OIDC/trusted-header auth modes.

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
- [Request Lifecycle](docs/request-lifecycle.md)
- [Auth Model](docs/auth-model.md)
- [Security And Privacy](docs/security-privacy.md)
- [Security Hardening](docs/security-hardening.md)
- [Threat Model](docs/threat-model.md)
- [Cross-Origin Deployment](docs/cross-origin-deployment.md)
- [Event Taxonomy](docs/event-taxonomy.md)
- [Storage And Retention](docs/storage-retention.md)
- [Glossary](docs/glossary.md)
- [Monorepo Setup](docs/monorepo-setup.md)
- [Monorepo Concepts](docs/monorepo-concepts.md)
- [Milestone 1: Ingestion Spine](docs/milestone-1/)
- [Data Modeling Framework](docs/data-modeling-framework.md)
- [Roadmap](docs/roadmap.md)
