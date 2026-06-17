# How Watch Works

This document explains the full flow of Watch from setup to debugging.

## Mental Model

Watch is a self-hosted frontend monitoring system.

A developer creates a project in the Watch dashboard, installs the Watch browser SDK in a frontend app, and configures the SDK with that project's browser ingestion key.

When real users experience frontend issues, the SDK sends safe browser telemetry to Watch. Watch stores the events, processes them, groups errors, creates rollups, triggers alerts, and shows everything in the dashboard.

## High-Level Flow

```txt
Developer
  └── opens Watch dashboard
        └── creates project
              └── gets browser ingestion key
                    └── installs Watch SDK in frontend app

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

## 2. Create A Project

A developer logs into the Watch dashboard and creates a project.

Example:

```txt
Project: Customer Portal
Environment: production
Allowed origin: https://app.company.com
```

Watch generates a browser ingestion key or DSN for that project.

Example:

```txt
https://watch.company.com/ingest/pk_abc123
```

This key is safe to put in frontend code. It identifies the project and environment, but it does not grant dashboard access.

## 3. Install The Browser SDK

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

## 4. SDK Observes Frontend Health

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

## 5. SDK Sends Events To Ingestion API

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

## 6. Watch Stores Raw Events

Accepted events are stored in Postgres as raw events for short-term debugging.

Raw events are retained for a limited period, such as 14 days by default.

Rejected events are not silently ignored. Watch should keep counters showing why events were dropped, such as invalid schema, oversized payload, unknown project key, blocked origin, or rate limit.

## 7. Workers Process Events

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

## 8. Dashboard Reads Through The Dashboard API

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

## 9. Ingestion API And Dashboard API Are Different Surfaces

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

## 10. Developer Debugs Issues

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
