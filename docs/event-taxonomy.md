# Event Taxonomy

V1 supports seven frontend event types.

```txt
web_vital
frontend_error
network_request
navigation
asset_load
breadcrumb
deployment
```

## Common Envelope

All events share a stable envelope.

```json
{
  "environment": "production",
  "release": "2026.05.28-1",
  "service": "frontend",
  "timestamp": "...",
  "type": "web_vital",
  "context": {
    "route": "/dashboard",
    "user_id_hash": "...",
    "session_id": "..."
  },
  "payload": {}
}
```

The server derives `project_id` from the ingestion key; SDK events do not send
it as a top-level field.

## Samples And Rollups

Raw events are not the only thing Watch stores. Workers turn raw events into two derived shapes:

- **Rollups**: minute, hour, and day aggregates used for dashboards and alert thresholds. Counts, rates, and percentiles — not individual events.
- **Samples**: a small number of concrete events kept per issue or rollup for debugging. Watch stores `issue_samples`, `network_request_samples`, `asset_load_failure_samples`, and `breadcrumb_samples` attached to error events.

Sample size limits and retention rules live in [storage-retention.md](storage-retention.md). The event schemas below describe the shape of a single raw event; samples are stored in the same shape.

## Event Types

### `web_vital`

Captures browser performance health.

Metrics:

- `LCP`
- `CLS`
- `INP`
- `FCP`
- `TTFB`

### `frontend_error`

Captures browser JavaScript errors, unhandled promise rejections, and framework render crashes where integrations are installed.

Includes:

- Error name
- Message
- Stack trace
- Framework/component stack where available
- Route
- Release
- Browser/device metadata

### `network_request`

Captures frontend-observed network failures and optional request timings.

Includes:

- URL
- Method
- Status code where available
- Duration where enabled
- Failure reason for failed requests
- Route where request happened

### `navigation`

Captures page and client-side navigation performance.

Includes:

- From route or URL
- To route or URL
- Navigation type
- Duration
- Browser/device metadata

### `asset_load`

Captures failed frontend asset loads and chunk/version mismatch signals.

Includes:

- Asset URL
- Asset type: script, chunk, stylesheet, image, font, or other
- Failure reason where available
- Route where failure happened
- Release

### `breadcrumb`

Captures privacy-safe diagnostic context before an error.

Breadcrumbs are not session replay. They must not include DOM snapshots, screen recordings, input values, request bodies, response bodies, cookies, or storage values.

Includes:

- Breadcrumb type: navigation, network, asset, console, release, or manual
- Timestamp
- Route
- Short message or stable action name
- Status or outcome where relevant
- Sanitized metadata

### `deployment`

Captures release/deploy markers.

Includes:

- Release name
- Environment
- Commit SHA
- Deploy timestamp

## Error Grouping

Frontend errors are grouped into issues with deterministic fingerprints.

Fingerprint inputs:

- Error type
- Normalized exception name
- Normalized top stack frame file/function
- Route

Release is used for regression detection, not basic grouping.

## Route-Level Health

Rollups should support per-route views for:

- JavaScript error rate
- Framework render crash rate where available
- Web Vitals
- Navigation timing
- Network failure rate
- Asset/chunk failure rate
- Affected sessions
- Affected optional `userIdHash` values

## Breadcrumb Policy

The browser SDK should keep a small in-memory ring buffer of recent breadcrumbs and attach it to error events.

Default behavior:

- Keep the most recent 20-50 breadcrumbs per browser session.
- Send breadcrumbs with error events.
- Do not send every breadcrumb as a standalone event unless explicitly configured.
- Allow manual breadcrumbs through an SDK method such as `addBreadcrumb`.
