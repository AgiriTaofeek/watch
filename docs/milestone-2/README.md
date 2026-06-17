# Milestone 2: Browser SDK Core

A durable learning reference for the second milestone of Watch. M1 built the server-side pipeline; M2 builds the browser-side half — the TypeScript SDK that collects frontend health signals and sends them to the server.

For broader context see [docs/roadmap.md](../roadmap.md) and [docs/security-privacy.md](../security-privacy.md). The SDK lives in `packages/browser/`.

## 2. Vocabulary

Terms a backend-focused engineer may not have met.

- **Web Vitals** — a set of browser-measured metrics (LCP, CLS, INP, FCP, TTFB) that quantify page-load and interaction quality. Measured by the browser's Performance API; collected by the `web-vitals` library from the Chrome team.
- **`LCP` (Largest Contentful Paint)** — how long the main content took to appear. Under 2.5 s is "good".
- **`CLS` (Cumulative Layout Shift)** — how much page content jumped around during load. Under 0.1 is "good".
- **`INP` (Interaction to Next Paint)** — responsiveness of interactions. Under 200 ms is "good".
- **`FCP` (First Contentful Paint)** — when the first bit of content appears.
- **`TTFB` (Time to First Byte)** — how long the network took to start delivering bytes.
- **`PerformanceObserver`** — browser API that watches for performance entries asynchronously. `web-vitals` uses it internally; not available in jsdom.
- **Unhandled rejection** — a `Promise` that rejects with no `.catch()` handler. The browser fires `window.unhandledrejection` for these.
- **Breadcrumb** — a lightweight diagnostic trail entry recorded before an error. Not a replay; it describes *what happened* (route changed, network request failed) not *how the page looked*.
- **Ring buffer** — a fixed-capacity data structure that overwrites the oldest entry when full. The breadcrumb buffer keeps the 50 most recent entries without unbounded memory growth.
- **DSN (Data Source Name)** — the SDK configuration string that encodes the Watch server URL and the ingestion key. Format: `https://<host>/ingest/<key>`.
- **`navigator.sendBeacon`** — browser API for sending small payloads that can outlive the current page. `fetch(..., { keepalive: true })` is the modern equivalent used here.
- **`sessionStorage`** — browser storage cleared when the tab closes. Used for the anonymous session ID so each browser session gets a fresh ID.
- **`beforeSend` hook** — a user-supplied callback invoked before every event leaves the SDK. Return the event to send it, return `null` to drop it, or return a modified copy.

## 3. Mental Model: What Is M2?

M2 builds the browser half of the SDK → server pipeline.

```
Browser (your frontend app)
    │
    │  watch.init({ dsn: "https://watch.example.com/ingest/pk_abc123" })
    │
    ├── window.onerror, unhandledrejection  → frontend_error events
    ├── PerformanceObserver (via web-vitals) → web_vital events
    └── addBreadcrumb()                     → entries in the ring buffer
            │
            │  Transport (queue → flush every 5s or on pagehide)
            │  POST /ingest/pk_abc123
            ▼
    Watch server (M1) → raw_events table
```

The SDK is a single `init()` call that activates all collection. It is framework-agnostic — no React, Vue, or Angular dependency. Framework integrations come in M4.

## 4. The SDK Module Structure

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Public API: `init()`, `addBreadcrumb()`. Only file consumers import. |
| `src/client.ts` | Singleton client state; DSN parsing; event assembly; `beforeSend` hook; wires errors + vitals. |
| `src/transport.ts` | Event queue; HTTP flush; retry with exponential backoff. |
| `src/errors.ts` | `window.onerror` + `unhandledrejection` listeners. |
| `src/vitals.ts` | Web Vitals collection via `web-vitals`. |
| `src/breadcrumbs.ts` | Fixed-capacity ring buffer + `BreadcrumbEntry` type. |
| `src/session.ts` | Anonymous session ID from `sessionStorage`. |
| `src/redact.ts` | Field redaction, string truncation, URL query-param scrubbing. |
| `src/__tests__/privacy.test.ts` | Privacy test suite (the product promise in code). |

## 5. Key Design Decisions

### DSN format

`https://watch.example.com/ingest/pk_abc123`

Parsed with `new URL(dsn)`: the path must be `/ingest/<key>`. The SDK also accepts the older `https://<key>@<host>` form for compatibility, but public docs should use the canonical endpoint URL.

### Singleton client

One `init()` call per page. Repeated calls are ignored with a console warning. This prevents double-counting from frameworks that may call your SDK wrapper more than once during development hot-reloads.

The singleton is deliberately exposed as `_resetClient()` for tests — no other escape hatch is provided.

### One event per POST

The server's `POST /ingest/{key}` accepts exactly one event per request. The transport queues events in memory and sends them concurrently on flush. This is simpler than a batch envelope and keeps the server handler straightforward.

### `keepalive: true`

`fetch(..., { keepalive: true })` allows the request to outlive the page — essential for capturing events on `visibilitychange: hidden` (navigating away, closing the tab). This is the modern replacement for `navigator.sendBeacon`.

### Privacy by default

The SDK never reads `document.cookie`, `localStorage`, `sessionStorage` (beyond its own session ID key), form values, or request/response bodies. The `redact.ts` module provides utilities for stripping sensitive keys from objects before they leave the browser. The `beforeSend` hook lets users add custom redaction.

The privacy test suite (`src/__tests__/privacy.test.ts`) verifies these guarantees are not accidentally broken by future changes.

### `sessionStorage` for session ID

`sessionStorage` clears when the tab closes, giving each browser session a fresh random UUID. Persisting across sessions (via `localStorage`) would allow building user profiles across visits — that's out of scope for Watch's privacy posture.

## 6. Request / Response Flow

```
1. User calls watch.init({ dsn, environment, release })
   → parseDSN extracts key and endpoint
   → getSessionID() returns (or creates) a UUID in sessionStorage
   → installErrorHandlers() attaches window.onerror + unhandledrejection
   → collectVitals() registers PerformanceObservers
   → Transport starts its 5-second flush timer

2. A JavaScript error occurs
   → installErrorHandlers callback fires
   → captureEvent("frontend_error", { name, message, stack, breadcrumbs })
   → if beforeSend returns null → drop; otherwise enqueue

3. Transport timer fires (or visibilitychange: hidden)
   → flush() drains the queue
   → each event: fetch(endpoint, { method: "POST", body: JSON.stringify(event), keepalive: true })
   → 204 → success
   → 5xx or network error → retry up to 3× with exponential backoff
   → 4xx → not retried (bad key, invalid schema — retrying won't help)
```

## 7. Task Breakdown

Six tasks. Each is one PR, branched off `main`.

### Task 1 — `feat/m2-sdk-core`
Core `init()`, DSN parsing, singleton client state, session ID.

### Task 2 — `feat/m2-transport`
HTTP transport, event queue, flush timer, `keepalive` fetch, retry backoff.

### Task 3 — `feat/m2-error-capture`
`window.onerror` + `unhandledrejection` listeners. Breadcrumb snapshot attached to each error.

### Task 4 — `feat/m2-vitals`
Web Vitals via `web-vitals` (LCP, CLS, INP, FCP, TTFB). `web-vitals` added as a runtime dependency.

### Task 5 — `feat/m2-breadcrumbs`
Ring buffer implementation. `addBreadcrumb()` public API.

### Task 6 — `feat/m2-privacy`
Redaction utilities (`redact.ts`), `beforeSend` hook wired into `captureEvent`, privacy test suite.

## 8. What Is Intentionally NOT In M2

- **Navigation timing** — measuring page and SPA navigation duration (M3).
- **Network failure capture** — wrapping `fetch` / `XHR` (M3).
- **Asset load failure capture** — monitoring `<script>`, `<link>`, `<img>` errors (M3).
- **Auto-breadcrumbs** — recording navigation, network, and console events automatically (M3).
- **React error boundary integration** — M4.
- **Route context for React Router** — M4.
- **`setUser()`** — optional pseudonymous identity API (post-M2 addition).
- **Sample pages** — added alongside or after the core SDK is verified working.
