import { setRoute } from "@watch/browser"
import { useEffect } from "react"

// Manually set the current route template for Watch. Use this in any React Router
// version or mode where the automatic adapters don't apply — e.g. Declarative mode
// (<BrowserRouter>/<Routes>), React Router v4, or a custom router — by passing the
// route pattern you want events grouped under.
//
//   function UserPage() {
//     useWatchRoute("/users/:id")
//     return <Profile />
//   }
//
// Pathname-level navigation is already captured by the core SDK; this only
// upgrades the stored route from the raw URL to a stable template.
export function useWatchRoute(pattern: string): void {
  useEffect(() => {
    setRoute(pattern)
  }, [pattern])
}
