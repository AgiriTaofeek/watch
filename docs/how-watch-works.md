# How Watch Works

This document explains the full flow of Watch from setup to debugging.

## Mental Model

Watch is a self-hosted frontend monitoring system.

A developer creates a project in the Watch dashboard, installs the Watch browser SDK in a frontend app, and configures the SDK with that project's browser ingestion key.

When real users experience frontend issues, the SDK sends safe browser telemetry to Watch. Watch stores the events, processes them, groups errors, creates rollups, triggers alerts, and shows everything in the dashboard.

## High-Level Flow

```txt
Developer (owner)
  └── self-hosts Watch and creates the owner account
        └── invites teammates (optional)
              └── creates one project per frontend app
                    └── gets a browser ingestion key per environment
                          └── installs Watch SDK in the frontend app

User browser
  └── runs frontend app
        └── Watch SDK observes frontend health
              └── sends events to Watch ingestion API
                    └── Watch stores events in Postgres
                          └── worker processes events
                                └── dashboard shows issues, metrics, and alerts
```

## Step-By-Step Journey

## 1. Self-Host Watch

The company deploys Watch on its own infrastructure.

V1 includes:

- Go backend for ingestion, dashboard APIs, workers, and alerts
- Postgres database
- TanStack Start dashboard
- Docker Compose deployment files

This backend belongs to Watch itself. It is not the business application backend.

### First-run owner setup

When Watch starts with no users, the dashboard shows a one-time setup screen instead of the login page. The first person to open the dashboard becomes the `owner`:

1. Enter email, organization name, and a password.
2. Watch creates the organization and the owner account.
3. The setup endpoint returns `409` on every subsequent visit — setup runs exactly once.

After this, the dashboard is accessible at the login screen. Everyone else joins via an invite.

## 2. Create Projects

The owner logs in and creates a project for each frontend application the team wants to monitor. A Watch deployment can host many projects at once.

Example organization with three projects:

```txt
Organization: Acme Financial
├── Project: Customer Portal
│   ├── Environment: production   (key: wk_live_...)
│   └── Environment: staging      (key: wk_stag_...)
├── Project: Admin Dashboard
│   └── Environment: production   (key: wk_live_...)
└── Project: Marketing Site
    └── Environment: production   (key: wk_live_...)
```

Each environment gets its own ingestion key so staging events do not mix with production data. Keys can be rotated or revoked independently without affecting other environments.

Watch generates a browser ingestion key for each environment:

```txt
wk_live_a8f3c2d1e9b7f4a2
```

This key is safe to embed in frontend code. It identifies the project and environment but does not grant dashboard access.

## 3. Invite Your Team

Watch is built for teams. After the owner creates the first project, they invite colleagues from Settings → Users.

Each invite assigns a role:

| Role | What they can do |
|------|----------------|
| `owner` | Full control. Created once during setup. |
| `admin` | Create projects, rotate keys, invite users, configure settings. |
| `member` | View all projects, manage alert rules. Cannot manage users or rotate keys. |
| `viewer` | Read-only. Good for stakeholders and executives. |

All roles can see all projects in the organization. The role controls what they can do, not which projects they can reach.

**Invite by email** (requires SMTP, which is also used for alerts): Watch sends a link to the invited address.

**Copy a one-time link** (always available): the owner copies a secure link, valid for 72 hours, and shares it directly.

Either way, the invited user clicks the link, sets a display name and password, and lands directly in the dashboard. They skip the setup wizard because the organization and projects already exist.

## 4. Install The Browser SDK

The developer installs the Watch browser SDK in the frontend project.

Example:

```ts
import { init } from "@watch/browser"

init({
  dsn: "https://watch.company.com/ingest/pk_abc123",
  environment: "production",
  release: "customer-portal@2026.05.28"
})
```

The core SDK is frontend stack agnostic. It should work with:

- Plain HTML and JavaScript
- Traditional multi-page apps
- Server-rendered apps
- Static sites
- SPAs
- React, Vue, Angular, Svelte, and other frameworks

Optional integrations can add richer context for specific stacks, such as React error boundaries or React Router v7 route context.

If the frontend app already has its own auth system, Watch does not replace it or verify those users. The app can optionally provide safe impact metadata, such as a hashed user ID or coarse role.

Example:

```ts
watch.setUser({
  idHash: "hash-of-internal-user-id",
  role: "customer"
})
```

This is used only to count affected users. It is not used to authenticate ingestion requests or dashboard users.

## 5. SDK Observes Frontend Health

The SDK runs in the user's browser and observes frontend signals.

It can collect:

- Web Vitals
- JavaScript errors
- Unhandled promise rejections
- Framework render crashes where integrations are installed
- Page and client-side navigation performance
- Failed `fetch` and `XMLHttpRequest` calls
- Failed assets and chunks
- Privacy-safe breadcrumbs
- Release and environment metadata

It must not collect sensitive data by default.

It must not collect:

- Cookies
- Form values
- Local storage values
- Session storage values
- Request bodies
- Response bodies
- DOM snapshots
- Screen recordings
- Passwords, tokens, card data, account data, or transaction data

## 6. SDK Sends Events To Ingestion API

When an event happens, the SDK batches it and sends it to Watch.

```txt
POST /ingest/pk_abc123
```

The ingestion API is public-facing because browsers need to reach it, but it is restricted by:

- Project keys
- Allowed origins
- Payload size limits
- Event schema validation
- Rate limits
- Server-side redaction

The browser ingestion key is not a dashboard login token. It only authorizes event submission for a project/environment.

## 7. Watch Stores Raw Events

Accepted events are stored in Postgres as raw events for short-term debugging.

Raw events are retained for a limited period, such as 14 days by default.

Rejected events are not silently ignored. Watch should keep counters showing why events were dropped, such as invalid schema, oversized payload, unknown project key, blocked origin, or rate limit.

## 8. Workers Process Events

Background workers turn raw events into useful product data.

Workers create:

- Error groups
- Issue samples
- Web Vital rollups
- Network failure rollups
- Asset/chunk failure rollups
- Page/navigation performance rollups
- Route-level health
- Affected session counts
- Frontend health scores (v1 formula TBD)
- Alert evaluations

Workers also enforce retention and resolve source maps where available.

## 9. Dashboard Reads Through The Dashboard API

The Watch dashboard does not read directly from the SDK ingestion endpoint.

The dashboard communicates with the authenticated Dashboard API.

```txt
Watch Dashboard
  └── authenticated Dashboard API
        └── reads processed data from Postgres
```

This API requires user login and powers:

- Projects
- Users
- Settings
- Issues
- Web Vitals
- Network failures
- Releases
- Alerts
- System health

In v1, dashboard login is handled by Watch local auth. OIDC and trusted reverse-proxy auth are future roadmap items.

## 10. Ingestion API And Dashboard API Are Different Surfaces

Watch has two logical API surfaces.

```txt
User Browser
  └── public ingestion API
        └── accepts SDK telemetry using project keys

Watch Dashboard
  └── private Dashboard API
        └── requires authenticated user session
```

They can run inside the same Go server, but they must have different security rules.

The ingestion API accepts browser events. The Dashboard API manages and displays data.

## 11. Developer Debugs Issues

When a frontend issue happens, Watch helps answer:

- What broke?
- Which route or page was affected?
- Which release introduced it?
- Which browsers or devices saw it?
- How many sessions were affected?
- What happened immediately before the error?
- Is the issue still happening?

Example incident:

```txt
10:00 New release deployed
10:03 Chunk load failures spike
10:04 Users on /dashboard see ChunkLoadError
10:05 Watch groups errors into one issue
10:05 Alert sends email/webhook
10:06 Developer opens Watch dashboard
10:07 Issue shows release, route, asset URL, stack trace, and breadcrumbs
10:15 Developer fixes deploy/cache strategy
10:30 Watch shows recovery
```

## Final Summary

The accurate model is:

```txt
Create project in Watch
  └── get browser ingestion key
        └── install SDK in frontend app
              └── SDK sends frontend events to ingestion API
                    └── Watch validates, scrubs, and stores events
                          └── workers process events into issues and metrics
                                └── dashboard reads processed data through authenticated APIs
```

Watch answers what users' browsers experienced. Tools like Grafana can continue answering what the backend and infrastructure experienced.
