# Milestone 4: First Framework Integrations

A learning reference for M4 of Watch. M1–M3 built the server pipeline and a framework-agnostic browser SDK. M4 adds a `@watch/react` package with a React error boundary and a React Router v7 route context component, plus documents the integration contract that future adapters must implement.

---

## 2. Vocabulary

- **Error boundary** — a React class component that implements `componentDidCatch` and/or `getDerivedStateFromError` to catch render errors from its subtree. There is no functional-component equivalent; error boundaries must be class components.
- **`getDerivedStateFromError`** — a static lifecycle method called synchronously when a child throws. Returns new state so the boundary can render a fallback on the next render cycle.
- **`componentDidCatch`** — an instance lifecycle method called after the render has failed and the tree has been unmounted. Use this for side effects like reporting the error. `getDerivedStateFromError` + `componentDidCatch` are complementary: the static one updates state, the instance one fires the report.
- **`ErrorInfo.componentStack`** — a string of component names in the call stack when the error occurred. Provided by React as the second argument to `componentDidCatch`. Useful for identifying which component threw.
- **Route pattern vs actual URL** — `/users/:id` is a route *pattern* (template); `/users/123` is the *actual URL*. Grouping performance data by pattern rather than URL lets the dashboard show "P75 LCP for /users/:id" meaningfully. Without the pattern, every user ID would be a separate row.
- **`useMatches()`** — React Router v7 hook that returns the array of matched routes from root to leaf for the current URL. Each match includes `id`, `pathname`, `params`, `data`, and `handle`.
- **`UIMatch.params`** — an object mapping route parameter names to their actual values for the current URL. e.g. `{ id: "123" }` for a route defined as `/users/:id` matching `/users/123`.
- **Subpath export** — `"./router"` in `package.json#exports` allows `import { WatchRouterContext } from "@watch/react/router"`. This keeps `react-router` out of the main bundle for apps that only need the error boundary.
- **Integration API** — the two functions from `@watch/browser` that any framework adapter must call: `captureError()` for render errors and `setRoute()` for route pattern updates.

---

## 3. Mental Model: What Does M4 Add?

```
App renders
    │
    ├── <WatchErrorBoundary>          @watch/react
    │       componentDidCatch ──────► captureError(error, { componentStack })
    │                                     │
    │                                     │ frontend_error event
    │                                     ▼  mechanism: "error_boundary"
    │                                 Watch server
    │
    └── <WatchRouterContext />        @watch/react/router
            useMatches → buildRoutePattern ──► setRoute("/users/:id")
                                                   │
                                                   │ stored in _routePattern
                                                   ▼
                                           all subsequent events:
                                           context.route = "/users/:id"
```

---

## 4. Package Structure

`@watch/browser` (existing, extended):
- Added `captureError(error, options?)` — the integration API for error capture
- Added `setRoute(pattern)` — the integration API for route context
- `FrontendErrorPayload.mechanism` now includes `"error_boundary"`

`@watch/react` (new):

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Public API: `WatchErrorBoundary`, plus re-exports of `captureError` and `setRoute` |
| `src/error-boundary.tsx` | React class component using `componentDidCatch` |
| `src/router.tsx` | `WatchRouterContext` — separate build entry (`@watch/react/router`) |
| `src/__tests__/error-boundary.test.tsx` | Error boundary tests with `@testing-library/react` |
| `src/__tests__/router.test.tsx` | Router context tests with mocked hooks |

---

## 5. Key Design Decisions

### Why a separate `@watch/react` package?

Keeping React-specific code out of `@watch/browser` keeps the browser SDK framework-agnostic and adds no `react` or `react-router` transitive dependencies to the SDK. Apps that don't use React pay no cost.

### Why a class component for the error boundary?

React does not yet support functional-component error boundaries. `getDerivedStateFromError` and `componentDidCatch` are class-only lifecycle methods. There is no hooks equivalent. This is an intentional React design decision: error boundaries are deliberately explicit and visible in the component tree.

### `getDerivedStateFromError` vs `componentDidCatch`

They work together:
- `getDerivedStateFromError` — called synchronously during the render phase; returns new state so the tree can re-render with a fallback. Must not have side effects.
- `componentDidCatch` — called during the commit phase after the error has been recorded; safe for side effects like calling `captureError()`.

Using both correctly:
```tsx
static getDerivedStateFromError(): State {
  return { hasError: true }  // trigger fallback render
}

componentDidCatch(error: Error, info: ErrorInfo): void {
  captureError(error, { componentStack: info.componentStack ?? undefined })
}
```

### Route pattern reconstruction

`useMatches()` gives us the actual matched pathname and the route params. We reconstruct the template by replacing each param value with its `:paramName` placeholder:

```
pathname = "/users/123/posts/456"
params   = { userId: "123", postId: "456" }
→ "/users/:userId/posts/:postId"
```

This works for simple parameterised routes. Wildcard (`*`) splat segments are skipped because they span multiple path segments and can't be templated reliably without the original route definition.

### Subpath export for `react-router`

`@watch/react/router` is a separate build entry. `react-router` is a dev dependency (used for types and tests) but not listed in `peerDependencies` at the top level. Apps that don't use React Router can install `@watch/react` without any `react-router` concern. Apps that do use React Router import from the `/router` subpath and ensure `react-router` is in their own dependencies.

### `setRoute` module-level state

`setRoute(pattern)` stores the current route pattern in a module-level variable in `@watch/browser`. `currentRoute()` checks this before falling back to `window.location.pathname`. This means:
- All events after `setRoute("/users/:id")` carry that pattern
- The M3 navigation instrumentation still fires navigation events (with the raw pathname) for timing purposes
- The route context stored on events is the framework-supplied pattern when available

---

## 6. Integration API Contract

To build a Watch integration for any framework, implement two behaviours using the public API from `@watch/browser`:

### Error capture

```typescript
import { captureError } from "@watch/browser"

// In your framework's error handler / error boundary equivalent:
captureError(error, { componentStack?: string })
```

`captureError` builds a `frontend_error` event with `mechanism: "error_boundary"` and attaches the current breadcrumb snapshot. It is safe to call even before `init()` — it no-ops if the client is not initialised.

### Route context

```typescript
import { setRoute } from "@watch/browser"

// Whenever the active route changes:
setRoute("/users/:id")  // pass the route template, not the actual URL
```

`setRoute` is synchronous and lightweight — just a variable assignment. Call it on every route change. All subsequent events will carry the supplied pattern in `context.route`.

### What an adapter should NOT do

- Do not import from `@watch/browser`'s internal modules (anything not in `src/index.ts`).
- Do not call `captureEvent` directly — use `captureError` for framework errors.
- Do not re-implement transport, retry, or queuing — the browser SDK handles all of that.

---

## 7. Task Breakdown

### Task 1 — `feat/m4-integration-api`
Add `captureError()` and `setRoute()` to `@watch/browser`. Extend `FrontendErrorPayload`.

### Task 2 — `feat/m4-error-boundary`
Create `packages/react/` package scaffold + `WatchErrorBoundary` class component + tests.

### Task 3 — `feat/m4-router`
`WatchRouterContext` in `src/router.tsx` as a separate build entry. Tests with mocked hooks.
