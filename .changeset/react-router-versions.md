---
"@watch/react": minor
---

Add React Router support across versions and modes:

- `@watch/react/router` (v6.4+/v7 data & framework mode) now uses a hardened,
  segment-aware route-template reconstruction that correctly handles nested
  params, repeated values, splats, and avoids substring corruption.
- New `@watch/react/router-v5` adapter (`WatchRouteContextV5`) for React Router
  v4/v5, reading the route template directly from `useRouteMatch().path`.
- New `useWatchRoute(pattern)` hook for declarative mode, custom routers, or any
  case where the automatic adapters don't apply.

`react-router` and `react-router-dom` are now optional peer dependencies.
