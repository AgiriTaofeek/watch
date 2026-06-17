import { truncateString } from "./redact"

export interface FrontendErrorPayload {
  name: string
  message: string
  stack?: string
  mechanism: "onerror" | "unhandledrejection"
}

// Installs window-level error listeners and calls `onError` for each captured
// event. Returns a cleanup function that removes the listeners.
export function installErrorHandlers(
  onError: (payload: FrontendErrorPayload) => void,
): () => void {
  function handleError(event: ErrorEvent): void {
    // Ignore errors with no useful information (e.g. cross-origin "Script error").
    if (!event.error && !event.message) return

    onError({
      name: event.error?.name ?? "Error",
      message: truncateString(
        event.error?.message ?? event.message ?? "Unknown error",
      ),
      stack: event.error?.stack ? truncateString(event.error.stack) : undefined,
      mechanism: "onerror",
    })
  }

  function handleRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason
    const message =
      typeof reason === "string"
        ? reason
        : (reason?.message ?? "Unhandled promise rejection")

    onError({
      name: reason?.name ?? "UnhandledRejection",
      message: truncateString(String(message)),
      stack: reason?.stack ? truncateString(reason.stack) : undefined,
      mechanism: "unhandledrejection",
    })
  }

  window.addEventListener("error", handleError)
  window.addEventListener("unhandledrejection", handleRejection)

  return () => {
    window.removeEventListener("error", handleError)
    window.removeEventListener("unhandledrejection", handleRejection)
  }
}
