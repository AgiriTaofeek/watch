# Security And Privacy

This document describes the controls Watch ships with. See [threat-model.md](threat-model.md) for an honest list of what Watch does *not* protect against.

## Privacy Defaults

Watch should be safe for financial applications by default.

The SDKs must not collect:

- Request or response bodies
- Cookies
- Form values
- Local storage
- Session storage
- Card, account, transaction, PIN, BVN, SSN, or password fields
- IP addresses unless explicitly enabled
- DOM snapshots
- Screen recordings
- Click coordinates tied to page content

User identity should be optional and pseudonymous, such as `userIdHash`.

## Privacy Test Suite

V1 must include tests proving the browser SDK does not collect sensitive data by default.

The test suite should verify that events do not include:

- Cookies
- Local storage values
- Session storage values
- Form field values
- Request bodies
- Response bodies
- Authorization headers
- Sensitive query parameters

These tests are part of the product promise, not just implementation detail.

## Breadcrumb Privacy

Breadcrumbs must be safe diagnostic metadata, not replay data.

Allowed breadcrumb examples:

- Route changed from `/login` to `/dashboard`
- Network request to `/api/accounts` failed with status `500`
- Script chunk failed to load
- Console error category occurred
- Manual app event named `transfer_form_submitted`

Disallowed breadcrumb data:

- DOM HTML
- Screenshots
- Text typed by users
- Form values
- Request or response bodies
- Cookies or storage values
- Full authorization headers

Manual breadcrumbs should encourage stable action names over raw user-provided text.

## Redaction Model

Watch uses three layers of redaction.

### SDK Defaults

- Collect only allowlisted metadata
- Truncate long strings
- Avoid bodies, cookies, headers, forms, and storage
- Support a `beforeSend(event)` hook

### Server Ingestion

- Validate schemas per event type
- Drop unknown fields
- Redact common sensitive keys
- Truncate messages, URLs, and query strings
- Reject oversized payloads

### Project Configuration

- Custom redact keys
- Custom redact patterns
- Allowed browser origins
- Optional IP collection
- Configurable retention

## Ingestion Authentication

Browser events use project-scoped client keys that are safe to expose.

Keys must support:

- Project and environment scoping
- Rotation
- Revocation
- Rate limiting
- Origin allowlists for browser events

Dashboard user auth must never be used for SDK ingestion.

## Dashboard Authentication

See [auth-model.md](auth-model.md) for the full auth model.

V1 implements local authentication only while keeping the user model compatible with external auth providers later.

- First admin created during setup
- Invite-only user creation
- Password hashing with Argon2id or bcrypt
- Secure session cookies
- CSRF protection for mutations
- Basic roles: `owner`, `admin`, `member`, `viewer`

Future dashboard auth modes, not implemented in v1:

- OIDC auth for existing identity providers
- Trusted header auth for deployments behind an authenticated reverse proxy

Dashboard auth must remain separate from ingestion auth. A browser ingestion key must never grant dashboard access.

## Monitored App User Identity

The monitored frontend application may already have its own auth service.

Watch should not verify those users directly. Instead, the app may provide optional pseudonymous impact metadata.

Example:

```ts
watch.setUser({
  idHash: "hash-of-internal-user-id",
  role: "customer"
})
```

By default, Watch should accept only safe identity fields such as `userIdHash`, anonymous session ID, and coarse role/segment. Raw emails, names, account numbers, phone numbers, and transaction identifiers should not be collected by default.
