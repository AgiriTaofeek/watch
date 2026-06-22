import { setRoute } from "@watch/browser"
import { useEffect } from "react"
import { useLocation, useMatches } from "react-router"
import { buildRoutePattern } from "./route-pattern"

// Place this component anywhere inside a React Router v6.4+/v7 <RouterProvider>
// (or root layout) to keep Watch's route context in sync with navigations. It
// renders nothing — it only calls setRoute() when the active route changes so
// all subsequent Watch events carry the route template rather than the raw URL.
//
// Requires Data mode or Framework mode (RouterProvider). useMatches() is not
// available in Declarative mode (<BrowserRouter>); those apps rely on the core
// navigation instrumentation (pathname-level) and can use useWatchRoute() to set
// a template manually. For React Router v4/v5 use WatchRouterContextV5 from
// "@watch/react/router-v5".
//
// Usage (in your root layout or _app equivalent):
//   import { WatchRouterContext } from "@watch/react/router"
//   export default function RootLayout() {
//     return <><WatchRouterContext /><Outlet /></>
//   }
export function WatchRouterContext(): null {
  const location = useLocation()
  const matches = useMatches()

  // Compute the pattern as a string during render. useMatches() returns a new
  // array reference on every call, so using [matches] as a dep would fire the
  // effect on every render. A string dep fires only when the value changes.
  const deepest = matches.at(-1)
  const routePattern = deepest
    ? buildRoutePattern(deepest.pathname, deepest.params)
    : location.pathname

  useEffect(() => {
    setRoute(routePattern)
  }, [routePattern])

  return null
}
