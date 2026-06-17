import { setRoute } from "@watch/browser"
import { useEffect } from "react"
import { useLocation, useMatches } from "react-router"

// Reconstructs a route template from the deepest matched pathname + params.
// Replaces actual param values with their named placeholders so the route
// stored in Watch is "/users/:id" rather than "/users/123".
function buildRoutePattern(
  pathname: string,
  params: Record<string, string | undefined>,
): string {
  let pattern = pathname
  for (const [key, value] of Object.entries(params)) {
    // Skip wildcard splat — it spans multiple segments and can't be templated
    // reliably without knowing the original route definition.
    if (value && key !== "*") {
      pattern = pattern.replace(`/${value}`, `/:${key}`)
    }
  }
  return pattern
}

// Place this component anywhere inside a React Router v7 <RouterProvider> (or
// root layout) to keep Watch's route context in sync with navigations. It
// renders nothing — it only calls setRoute() when the active route changes so
// all subsequent Watch events carry the route template rather than the raw URL.
//
// Requires Data mode or Framework mode (RouterProvider). useMatches() is not
// available in Declarative mode (<BrowserRouter>); those apps rely on M3
// navigation instrumentation which captures pathname changes automatically.
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
