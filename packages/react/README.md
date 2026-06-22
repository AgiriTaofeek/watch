# @watch/react

React integration for the [Watch](https://github.com/AgiriTaofeek/watch) browser
SDK: a render-error boundary and React Router route-context adapters across
versions and modes.

Install alongside `@watch/browser`:

```bash
npm i @watch/browser @watch/react
```

Initialize the core SDK once (see `@watch/browser`), then add the pieces below.

## Error boundary

Reports React render crashes (with component stack) to Watch.

```tsx
import { WatchErrorBoundary } from "@watch/react"

<WatchErrorBoundary fallback={<Oops />}>
  <App />
</WatchErrorBoundary>
```

## Route context (so events group by template, e.g. `/users/:id`)

Pathname-level navigation is captured automatically by `@watch/browser`. The
adapters below upgrade the stored route from the raw URL to a stable **template**.
Pick the one matching your React Router version/mode:

### React Router v6.4+ / v7 — data & framework mode

```tsx
import { WatchRouterContext } from "@watch/react/router"

// Render anywhere inside your RouterProvider (e.g. a root layout):
<><WatchRouterContext /><Outlet /></>
```

Uses `useMatches`, available in data and framework mode.

### React Router v4 / v5

```tsx
import { WatchRouteContextV5 } from "@watch/react/router-v5"

// Inside the routed subtree (e.g. a leaf route within <Switch>):
<Route path="/users/:id">
  <WatchRouteContextV5 />
  <UserPage />
</Route>
```

Reads the route template directly from `useRouteMatch().path` (requires
`react-router-dom` ≥ 5.1).

### Declarative mode, custom routers, or anything else — `useWatchRoute`

When no automatic adapter fits (e.g. v6 `<BrowserRouter>`/`<Routes>`, v4 without
hooks, or a custom router), set the template manually:

```tsx
import { useWatchRoute } from "@watch/react"

function UserPage() {
  useWatchRoute("/users/:id")
  return <Profile />
}
```

## Peer dependencies

`react` is required. `react-router` (v6.4+/v7) and `react-router-dom` (v4/v5) are
**optional** peers — install only the one your app uses. The matching adapter
import is the only thing that pulls it in.
