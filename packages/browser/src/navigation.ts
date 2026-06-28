import type { BreadcrumbEntry } from "./breadcrumbs"

// Timing segments extracted from PerformanceNavigationTiming for hard-nav page
// loads. All values are milliseconds rounded to the nearest integer.
export interface NavigationTimingSegments {
  dns: number
  tcp: number
  // tls is 0 for plain HTTP connections that did not perform a TLS handshake.
  tls: number
  ttfb: number
  download: number
  dom: number
}

export interface NavigationPayload {
  from?: string
  to: string
  navigation_type: "page" | "push" | "replace" | "popstate"
  duration?: number // ms, from PerformanceNavigationTiming — page loads only
  segments?: NavigationTimingSegments // only present for navigation_type === "page"
}

type OnNavigation = (payload: NavigationPayload) => void
type OnBreadcrumb = (entry: Omit<BreadcrumbEntry, "timestamp">) => void

function extractSegments(
  nav: PerformanceNavigationTiming,
): NavigationTimingSegments {
  return {
    dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    tcp: Math.round(nav.connectEnd - nav.connectStart),
    // secureConnectionStart is 0 for plain HTTP or when the connection was reused.
    tls:
      nav.secureConnectionStart > 0
        ? Math.round(nav.connectEnd - nav.secureConnectionStart)
        : 0,
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    download: Math.round(nav.responseEnd - nav.responseStart),
    dom: Math.round(nav.domContentLoadedEventEnd - nav.responseStart),
  }
}

export function installNavigationInstrumentation(
  onNavigation: OnNavigation,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  if (typeof window === "undefined") return () => {}

  const cleanups: Array<() => void> = []

  // Page navigation timing — fires once after the initial load with full
  // PerformanceNavigationTiming data including per-phase timing segments.
  if (typeof PerformanceObserver !== "undefined") {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const nav = entry as PerformanceNavigationTiming
          onNavigation({
            to: window.location.pathname,
            navigation_type: "page",
            duration: Math.round(nav.duration),
            segments: extractSegments(nav),
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
