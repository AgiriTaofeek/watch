export type { EventEnvelope, EventType } from "@watch/contracts"
export type { BreadcrumbEntry } from "./breadcrumbs"
export type { InitOptions } from "./client"
export type { FrontendErrorPayload } from "./errors"
export type { NavigationPayload } from "./navigation"
export type { NetworkRequestPayload } from "./network"
export type { AssetLoadPayload } from "./assets"
export type { WebVitalPayload } from "./vitals"

import type { BreadcrumbEntry } from "./breadcrumbs"
import {
  type InitOptions,
  addBreadcrumbToClient,
  captureError,
  initClient,
  setRoute,
} from "./client"

// Initialises the Watch SDK. Call once, as early as possible on the page.
// dsn format: https://<ingestion-key>@<watch-server-host>
//   e.g. https://pk_abc123@watch.example.com
export function init(options: InitOptions): void {
  initClient(options)
}

// Appends a manual breadcrumb to the in-memory ring buffer. Breadcrumbs are
// attached to the next frontend_error event. Use stable action names rather
// than raw user-generated text (see docs/security-privacy.md).
export function addBreadcrumb(entry: Omit<BreadcrumbEntry, "timestamp">): void {
  addBreadcrumbToClient(entry)
}

// Reports a framework-level render error (e.g. from a React error boundary).
export { captureError }

// Sets the current route pattern so all subsequent events carry the route
// template (e.g. "/users/:id") rather than the actual URL path.
export { setRoute }
