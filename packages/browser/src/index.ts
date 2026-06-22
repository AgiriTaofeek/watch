export type { EventEnvelope, EventType } from "@watch/contracts"
export type { AssetLoadPayload } from "./assets"
export type { BreadcrumbEntry } from "./breadcrumbs"
export type { InitOptions } from "./client"
export type { FrontendErrorPayload } from "./errors"
export type { NavigationPayload } from "./navigation"
export type { NetworkRequestPayload } from "./network"
export type { WebVitalPayload } from "./vitals"

import type { BreadcrumbEntry } from "./breadcrumbs"
import {
  addBreadcrumbToClient,
  captureError,
  type InitOptions,
  initClient,
  setRoute,
  setUser,
} from "./client"

// Initialises the Watch SDK. Call once, as early as possible on the page.
// dsn format: https://<watch-server-host>/ingest/<ingestion-key>
//   e.g. https://watch.example.com/ingest/pk_abc123
export function init(options: InitOptions): void {
  initClient(options)
}

// Appends a manual breadcrumb to the in-memory ring buffer. Breadcrumbs are
// attached to the next frontend_error event. Use stable action names rather
// than raw user-generated text (see docs/security-privacy.md).
export function addBreadcrumb(entry: Omit<BreadcrumbEntry, "timestamp">): void {
  addBreadcrumbToClient(entry)
}

// captureError: reports a framework-level render error (e.g. from a React error
// boundary). setRoute: sets the current route template (e.g. "/users/:id").
// setUser: associates events with a pseudonymous user hash (PII-free).
export { captureError, setRoute, setUser }
