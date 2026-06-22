import { setRoute } from "@watch/browser"
import { useEffect } from "react"
import { useRouteMatch } from "react-router-dom"

// React Router v4/v5 adapter (react-router-dom). Unlike v6+/v7, these versions
// expose the route TEMPLATE directly: useRouteMatch() returns `match.path` (e.g.
// "/users/:id"). Place this inside the routed subtree — typically in a leaf route
// or a layout rendered within <Switch> — so it reads the deepest matched route.
// It renders nothing and only calls setRoute() when the active route changes.
//
// Requires the hooks API (react-router-dom >= 5.1). For v4 (no hooks), use
// useWatchRoute(pattern) from "@watch/react" or read match.path from a
// withRouter/<Route render> prop and call setRoute() yourself.
//
// Usage (v5):
//   <Route path="/users/:id">
//     <WatchRouteContextV5 />
//     <UserPage />
//   </Route>
export function WatchRouteContextV5(): null {
  const match = useRouteMatch()
  const pattern = match?.path ?? "/"

  useEffect(() => {
    setRoute(pattern)
  }, [pattern])

  return null
}
