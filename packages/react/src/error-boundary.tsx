import { captureError } from "@watch/browser"
import type { ErrorInfo, ReactNode } from "react"
import { Component } from "react"

interface Props {
  children: ReactNode
  // Rendered when an error has been caught. Defaults to null (renders nothing).
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

// Wraps children in a React error boundary. Any render error thrown inside is
// captured and sent to Watch as a frontend_error event with mechanism
// "error_boundary". After an error, the fallback (if provided) is rendered.
//
// Usage:
//   <WatchErrorBoundary fallback={<ErrorPage />}>
//     <App />
//   </WatchErrorBoundary>
export class WatchErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, {
      componentStack: info.componentStack ?? undefined,
    })
  }

  override render(): ReactNode {
    return this.state.hasError
      ? (this.props.fallback ?? null)
      : this.props.children
  }
}
