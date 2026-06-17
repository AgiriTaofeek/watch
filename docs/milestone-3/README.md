# Milestone 3: Navigation & Network Instrumentation

A learning reference for M3 of Watch. M2 built the SDK core (errors, vitals, breadcrumbs, transport); M3 adds automatic instrumentation for navigation, network failures, and asset load failures so the SDK captures these signals without any manual calls from the application.

The new files all live in `packages/browser/src/`.

---

## 2. Vocabulary

- **`PerformanceObserver`** — browser API for observing performance timeline entries asynchronously. Used here to capture `PerformanceNavigationTiming` after the page load completes.
- **`PerformanceNavigationTiming.duration`** — milliseconds from `navigationStart` to `loadEventEnd`. The most useful single number for page-load performance.
- **SPA (single-page application) navigation** — a route change that does not reload the page. React Router, Next.js, Remix, etc. implement this by calling `history.pushState` or `history.replaceState` rather than triggering a browser navigation.
- **History API patching** — replacing `history.pushState` and `history.replaceState` with wrapper functions so the SDK is notified on every SPA navigation. This is the same technique used by analytics tools and performance monitors.
- **`popstate` event** — fires when the user navigates back or forward. Unlike `pushState`, this event bubbles and is dispatched by the browser itself.
- **Monkey-patching** — replacing a global method (like `window.fetch` or `XMLHttpRequest.prototype.open`) with a wrapper that adds behaviour before or after calling the original. Used for network instrumentation.
- **`WeakMap`** — a Map whose keys are objects and whose entries are garbage-collected when the key is GC'd. Used to attach XHR metadata (method, url, start time) to `XMLHttpRequest` instances without polluting them with non-standard properties.
- **Capture phase** — the first phase of DOM event propagation, travelling from the document root *down* to the target. Resource load errors (`<script>`, `<link>`, `<img>`) do not bubble, so they can only be observed by a capture-phase listener on `window`.
- **Feedback loop** — if the SDK's own `fetch` calls to `/ingest/{key}` were intercepted by the network instrumentation, those calls would generate `network_request` events, which would trigger more flush calls, which would generate more events, etc. Prevented by snapshotting `fetch` in the `Transport` constructor before the instrumentation wraps it.

---

## 3. Mental Model: What Does M3 Add?

```
Browser (your app)
    │
    ├── history.pushState / replaceState  →  navigation events + breadcrumbs
    ├── PerformanceObserver (navigation)  →  navigation event (page load timing)
    ├── popstate                          →  navigation event + breadcrumb
    │
    ├── fetch (patched)                   →  network_request events + breadcrumbs
    ├── XMLHttpRequest (patched)          →  network_request events + breadcrumbs
    │
    └── window.addEventListener("error", ..., true)  →  asset_load events + breadcrumbs
            │
            │  Transport (M2, unchanged)
            │  POST /ingest/pk_...
            ▼
    Watch server → raw_events table
```

---

## 4. Module Structure

| File | Responsibility |
|------|---------------|
| `src/navigation.ts` | Page navigation timing via `PerformanceObserver`; SPA navigation via history patching; `popstate` listener. |
| `src/network.ts` | `fetch` wrapper; `XMLHttpRequest` prototype patches. Emits `network_request` events on failures and breadcrumbs on all requests. |
| `src/assets.ts` | Capture-phase `error` listener on `window`. Classifies `<script>`, `<link>`, `<img>` failures. |
| `src/transport.ts` | **Updated** — snapshots `fetch` at construction time to avoid intercepting its own ingest calls. |
| `src/client.ts` | **Updated** — calls the three `install*` functions in `initClient`. |
| `src/__tests__/instrumentation.test.ts` | Test suite for all three instrumentations. |

---

## 5. Key Design Decisions

### History API patching for SPA navigation

The browser does not fire any event when `history.pushState` or `history.replaceState` is called — it only fires `popstate` for back/forward. To observe SPA navigations the SDK replaces both methods with wrappers that call the original and then report the navigation. The `currentPath` variable tracks the previous route so the `from` field is always accurate.

```
history.pushState("/a") → currentPath = "/a" → SDK sees from=/ to=/a
history.pushState("/b") → currentPath = "/b" → SDK sees from=/a to=/b
```

After cleanup, the original methods are restored so the instrumentation does not outlive the test or SDK lifecycle.

### fetch isolation in Transport

The `Transport` class needs to call `fetch` to flush events to the ingest endpoint. If the network instrumentation wrapped `window.fetch` first, the transport's calls would be intercepted and generate extra `network_request` events, which would enqueue more events, creating a feedback loop.

The fix: `Transport` saves `private readonly _fetch = fetch` in its constructor. Since `Transport` is instantiated in `initClient` *before* `installNetworkInstrumentation` patches `window.fetch`, `this._fetch` always points to the original browser `fetch`, not the wrapper.

Order of operations in `initClient`:
1. `new Transport(endpoint)` — `this._fetch = fetch` (original)
2. `installNetworkInstrumentation(...)` — patches `window.fetch`
3. App calls `window.fetch(...)` — intercepted by the wrapper
4. Transport flush calls `this._fetch(...)` — bypasses the wrapper ✓

### WeakMap for XHR metadata

The XHR API is event-based: `open()` is called first (setting the method + URL), then `send()` is called later (starting the request). The SDK needs to carry the method and URL from `open` to the `loadend` listener installed in `send`. Storing this in a WeakMap keyed on the XHR instance is the right approach:

- No non-standard properties on the XHR instance (no accidental serialisation leakage).
- Memory is automatically reclaimed when the XHR instance is GC'd.
- Works even if multiple XHR instances are in flight simultaneously.

### Capture-phase for asset errors

Resource load errors (a `<script>` failing to download, a `<link>` 404ing) dispatch an `error` event on the element itself. This event **does not bubble**, so a standard `window.addEventListener("error", handler)` (bubble phase) would never see it. With `useCapture: true`, the listener sits at the top of the capture phase and receives the event before it reaches the element, regardless of whether it bubbles.

```javascript
window.addEventListener("error", handler, true)  // capture — sees resource errors
window.addEventListener("error", handler, false) // bubble  — sees only JS errors
```

The `classifyTarget` function inspects the event target's tag name to distinguish `<script>`, `<link>`, and `<img>` failures, and returns `null` for anything else (including JS runtime errors, whose target is `window`).

---

## 6. Task Breakdown

### Task 1 — `feat/m3-navigation`
`src/navigation.ts` + page timing via `PerformanceObserver` + SPA patching + popstate listener.

### Task 2 — `feat/m3-network`
`src/network.ts` + fetch wrapper + XHR prototype patches + transport isolation fix in `transport.ts`.

### Task 3 — `feat/m3-assets`
`src/assets.ts` + capture-phase listener + `classifyTarget` helper.

### Task 4 — `feat/m3-wire`
Wire the three `install*` functions into `client.ts`; export new payload types from `index.ts`.

### Task 5 — `feat/m3-tests`
`src/__tests__/instrumentation.test.ts` covering all three instrumentations.
