import type { BreadcrumbEntry } from "./breadcrumbs"
import { redactURL } from "./redact"

export interface AssetLoadPayload {
  url: string
  asset_type: "script" | "stylesheet" | "image" | "font" | "other"
}

type OnFailure = (payload: AssetLoadPayload) => void
type OnBreadcrumb = (entry: Omit<BreadcrumbEntry, "timestamp">) => void

// Derives the asset URL and type from the element that failed to load.
// Returns null when the event target is not a trackable resource element.
function classifyTarget(target: EventTarget | null): AssetLoadPayload | null {
  if (!(target instanceof HTMLElement)) return null

  switch (target.tagName.toUpperCase()) {
    case "SCRIPT": {
      const src = (target as HTMLScriptElement).src
      return src ? { url: redactURL(src), asset_type: "script" } : null
    }
    case "LINK": {
      const href = (target as HTMLLinkElement).href
      if (!href) return null
      const rel = (target as HTMLLinkElement).rel.toLowerCase()
      // Treat any non-stylesheet <link> as a font (preload, modulepreload, etc.)
      return {
        url: redactURL(href),
        asset_type: rel === "stylesheet" ? "stylesheet" : "font",
      }
    }
    case "IMG": {
      const src = (target as HTMLImageElement).src
      return src ? { url: redactURL(src), asset_type: "image" } : null
    }
    default:
      return null
  }
}

export function installAssetInstrumentation(
  onFailure: OnFailure,
  onBreadcrumb: OnBreadcrumb,
): () => void {
  if (typeof window === "undefined") return () => {}

  function handleError(event: Event) {
    // Only resource-load errors have a non-null currentTarget on the window
    // capture listener; JS errors are handled by installErrorHandlers instead.
    const classified = classifyTarget(event.target)
    if (!classified) return

    onBreadcrumb({
      type: "asset",
      message: `${classified.asset_type} load failed: ${classified.url}`,
    })
    onFailure(classified)
  }

  // Capture phase is required — resource errors do not bubble.
  window.addEventListener("error", handleError, true)
  return () => window.removeEventListener("error", handleError, true)
}
