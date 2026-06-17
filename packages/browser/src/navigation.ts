import type { BreadcrumbEntry } from "./breadcrumbs"

export interface NavigationPayload {
  from?: string
  to: string
  navigation_type: "page" | "push" | "replace" | "popstate"
  duration?: number // ms, from PerformanceNavigationTiming — page loads only
}

type OnNavigation = (payload: NavigationPayload) => void
type OnBreadcrumb = (entry: Omit<BreadcrumbEntry, "timestamp">) => void

export function installNavigationInstrumentation(
  onNavigation: OnNavigation,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  if (typeof window === "undefined") return () => {}

  const cleanups: Array<() => void> = []

  // Page navigation timing — fires once after the initial load with the full
  // PerformanceNavigationTiming duration (navigationStart → loadEventEnd).
  if (typeof PerformanceObserver !== "undefined") {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          onNavigation({
            to: window.location.pathname,
            navigation_type: "page",
            duration: Math.round(
              (entry as PerformanceNavigationTiming).duration,
            ),
          })
        }
      })
      observer.observe({ type: "navigation", buffered: true })
      cleanups.push(() => observer.disconnect())
    } catch {
      // Some environments support PerformanceObserver but not the navigation type.
    }
  }

  // Track the "current" route so we can report the from-path on SPA transitions.
  let currentPath = window.location.pathname

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const from = currentPath
    originalPushState.call(history, data, unused, url)
    const to = window.location.pathname
    currentPath = to
    onBreadcrumb({ type: "navigation", message: `${from} → ${to}` })
    onNavigation({ from, to, navigation_type: "push" })
  }

  history.replaceState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const from = currentPath
    originalReplaceState.call(history, data, unused, url)
    const to = window.location.pathname
    currentPath = to
    onBreadcrumb({ type: "navigation", message: `${from} → ${to}` })
    onNavigation({ from, to, navigation_type: "replace" })
  }

  cleanups.push(() => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
  })

  // popstate fires when the user uses browser back/forward.
  function onPopState() {
    const from = currentPath
    const to = window.location.pathname
    currentPath = to
    onBreadcrumb({ type: "navigation", message: `${from} → ${to}` })
    onNavigation({ from, to, navigation_type: "popstate" })
  }
  window.addEventListener("popstate", onPopState)
  cleanups.push(() => window.removeEventListener("popstate", onPopState))

  return () => {
    for (const fn of cleanups) fn()
  }
}
