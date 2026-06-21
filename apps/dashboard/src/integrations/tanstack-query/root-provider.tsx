import { QueryClient } from "@tanstack/react-query"

// Creates a fresh QueryClient per router instance. In SSR each request calls
// getRouter() → getContext(), so each request gets an isolated cache and there
// is no cross-request state bleeding. On the client this runs once at startup.
// QueryClientProvider is injected automatically by setupRouterSsrQueryIntegration
// in router.tsx — it patches router.options.Wrap, so no manual provider is needed.
export function getContext() {
  const queryClient = new QueryClient()
  return { queryClient }
}
