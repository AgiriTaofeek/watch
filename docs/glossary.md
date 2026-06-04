# Glossary

Terms used precisely across the Watch docs. When a term is defined here, treat the definition as canonical.

## Project

A frontend application tracked in Watch (e.g. "Customer Portal"). A Watch deployment can host many projects.

## Environment

A deployment scope inside a project — `production`, `staging`, `dev`, and so on. A project has many environments. Ingestion keys and retention settings are scoped per project and environment.

## Release

A versioned deploy of a project + environment combination, identified by a release name (e.g. `customer-portal@2026.05.28`). Releases anchor regression detection and source map resolution.

## Issue

A group of frontend errors sharing a deterministic fingerprint (error type, normalized exception name, normalized top stack frame, route). Releases are used for regression detection, not basic grouping.

## Sample

A concrete event retained alongside an issue or rollup for debugging. Watch keeps a small bounded number of samples per issue or rollup, not every raw event.

## Rollup

A minute, hour, or day aggregate of raw events. Rollups power dashboard charts and alert threshold evaluation. They are counts, rates, and percentiles — not individual events.

## Breadcrumb

A privacy-safe diagnostic record kept in the SDK's in-memory ring buffer and attached to error events. Breadcrumbs are *not* session replay — they never include DOM, screenshots, input values, request/response bodies, cookies, or storage values.

## Frontend health score

A summary number per project, route, and release. The v1 formula is **TBD**; the score is reserved as a product surface but the computation is deferred to a later spec.

## Ingestion key (DSN)

A project- and environment-scoped public client identifier safe to embed in frontend code. It authorizes the SDK to send events to the ingestion API but does not grant any dashboard access. Keys support rotation, revocation, rate limits, and origin allowlists.

## Dashboard auth

Authentication for people logging into Watch. Dashboard auth controls access to projects, issues, alerts, settings, and user management. It is separate from ingestion auth.

## Local auth

Watch-managed dashboard authentication using email/password, secure session cookies, CSRF protection, and role-based access.

## OIDC auth

Dashboard authentication delegated to an OpenID Connect identity provider. Watch trusts the provider for login and maps claims such as groups to Watch roles.

## Trusted header auth

Dashboard authentication delegated to a trusted reverse proxy or gateway that forwards identity headers to Watch. Safe only when Watch accepts those headers from configured trusted proxies.

## Monitored app user identity

Optional pseudonymous identity metadata supplied by the monitored frontend app, such as `userIdHash` or coarse role. Watch uses this for impact analysis, not authentication.

## Dashboard API

The authenticated server-side API that the dashboard uses for both management (users, projects, keys, alert rules, settings) and reads (issues, Web Vitals, performance, releases). Distinct from the public ingestion API. Requires an authenticated user session.

## Ingestion API

The public-facing API that receives events from browser SDKs. Authenticated by project ingestion keys, not user sessions. Enforces origin allowlists, payload size limits, schema validation, rate limits, and server-side redaction.

## Affected sessions

The count of distinct browser sessions that experienced a given issue, rollup window, or release. Optionally paired with a count of affected `userIdHash` values when projects opt into pseudonymous identity.
