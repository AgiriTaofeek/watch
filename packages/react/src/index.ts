export { WatchErrorBoundary } from "./error-boundary"

// Re-export the integration primitives so consumers of @watch/react can call
// captureError and setRoute without a separate import from @watch/browser.
export { captureError, setRoute } from "@watch/browser"
