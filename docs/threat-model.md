# Threat Model

[security-privacy.md](security-privacy.md) describes the controls Watch ships with, and [security-hardening.md](security-hardening.md) is the operator checklist for closing the gaps below. This document is the counterpart: an honest list of what Watch does **not** protect against, so operators can plan compensating controls.

Watch v1 is a self-hosted system. The deploying organization is responsible for the network, database, and OS-level posture of the host. Watch does not replace those layers.

## Compromised ingestion key

Project ingestion keys are public client credentials safe to embed in frontend code. A leaked key allows anyone to submit events to the project.

- **Mitigation provided**: rotation, revocation, rate limiting, origin allowlists, payload size caps, schema validation.
- **Not protected**: abuse window before revocation. Watch cannot distinguish a real-user event from an attacker-crafted event that satisfies validation.

## Origin allowlists

Origin allowlists block casual cross-site embedding of the SDK.

- **Mitigation provided**: rejection of events whose `Origin` header is not on the project's allowlist.
- **Not protected**: replay traffic from an attacker-controlled environment that forges `Origin`. Browsers enforce `Origin`; non-browser clients do not.

## Self-hosting trust boundary

Watch stores raw events in Postgres. Anyone with database, backup, or filesystem access can read every event ever ingested.

- **Mitigation provided**: server-side redaction, default-deny on sensitive fields, configurable retention.
- **Not protected**: confidentiality at rest. Operators must enable encryption at rest, restrict database access, and protect backups.

## SDK supply chain

The browser SDK is a third-party dependency in the deploying team's frontend build.

- **Mitigation provided**: signed releases of the SDK package.
- **Not protected**: the deploying team's npm install, lockfile integrity, or CDN. Use lockfiles, subresource integrity where applicable, and pin SDK versions.

## Source maps

When uploaded, source maps are stored in private artifact storage and used by the worker for stack-trace resolution. Source maps can be used to reverse-engineer minified frontend bundles.

- **Mitigation provided**: artifacts are private to the Dashboard API and not served publicly.
- **Not protected**: read access by any operator with database or storage access. Treat source maps as sensitive.

## Dashboard authentication

V1 uses local accounts with Argon2id-hashed passwords, secure session cookies, and CSRF protection for mutations. OIDC and trusted header auth are future roadmap items, not v1 features.

- **Mitigation provided**: local auth, role-based access control, CSRF, and a user model that can support external identity providers.
- **Not protected**: MFA, SAML, audit-grade session management, or every enterprise SSO requirement in v1. Compensate with network controls, VPN, IP allowlists, or reverse-proxy auth where appropriate. See [security-hardening.md §9](security-hardening.md#9-network--deployment-hardening) for concrete options: firewall/security-group rules, reverse-proxy IP allowlists (nginx, Caddy, Traefik), and VPN/zero-trust access (Tailscale, WireGuard, Cloudflare Access).

## Trusted header auth

Trusted header auth is not implemented in v1. When it is added later, it will only be safe when Watch is reachable directly from trusted reverse proxies.

- **Mitigation provided**: trusted proxy CIDR configuration and explicit header names.
- **Not protected**: direct public access where attackers can submit spoofed identity headers. Operators must ensure untrusted clients cannot reach Watch with arbitrary auth headers.

## Monitored app user identity

The monitored frontend app may provide optional pseudonymous user impact metadata, such as `userIdHash`.

- **Mitigation provided**: privacy defaults, SDK guidance, redaction, and allowlisted identity fields.
- **Not protected**: incorrect or unsafe identity data sent by the monitored app. Watch cannot prove that a supplied `userIdHash` represents a real authenticated app user.

## Ingestion rate limiting

**Current state: not implemented.** Per-key rate limiting is planned but the ingest handler does not yet enforce it. This is a false claim in v1 documentation that must be corrected before production exposure.

- **Mitigation provided**: none at the application layer today. Payload size cap (1 MiB) and schema validation prevent the worst single-request abuse.
- **Not protected**: a buggy SDK sending thousands of events per second, a stolen ingestion key used to flood storage, or any volume-based denial of service against the database. Front Watch with a WAF or CDN-level rate limiter immediately. Per-key application-level rate limiting is a tracked gap.

## Event deduplication

The SDK has retry logic. If a batch is accepted by the server but the HTTP response is lost in transit, the SDK retries and the same events are written to `raw_events` twice. There is no client-generated event ID and no deduplication check at ingestion.

- **Mitigation provided**: none. Rollup upserts are idempotent for aggregated values, but the underlying raw event count is inflated. Error counts, session counts, and metric sample populations are all affected.
- **Not protected**: duplicate raw events from SDK retries. The fix is a stable client-side `event_id` (UUID generated by the SDK per event) stored in `raw_events` with a unique constraint, so retried batches are silently deduplicated on insert. This is how Sentry handles it.

## Worker memory pressure

The rollup worker fetches all raw events for a one-hour window into Go memory before aggregating them — no server-side `LIMIT`. At the v1 scale target of 1M events/day, a single hour produces roughly 40,000 events. All are loaded simultaneously.

- **Mitigation provided**: individual bucket sample arrays are capped at 200 entries. The raw fetch itself is unbounded.
- **Not protected**: memory exhaustion if a traffic spike or ingestion flood produces significantly more events than normal in a single hour. The worker runs in the same process as the web server, so an OOM condition kills both. The fix is to stream rows and aggregate incrementally, or enforce a `LIMIT` on the fetch with multiple pages.

## Worker query performance

The worker queries `raw_events` by `event_type` and `event_timestamp`. The existing indexes cover `(project_id, received_at)` and `(environment_id, received_at)` — not `(event_type, event_timestamp)`. At large event volumes the worker's hourly aggregation queries will do a sequential scan of the entire table.

- **Mitigation provided**: table is small in early deployments; the sequential scan is fast.
- **Not protected**: degraded worker performance as `raw_events` grows. A composite index on `(event_type, event_timestamp)` is the fix. This also directly impacts the p95 rollup latency target.

## Horizontal scaling hazards

The worker, in-memory login rate limiter, and in-memory session state all assume a single running instance.

- **Mitigation provided**: the system works correctly on one instance.
- **Not protected**: running two instances simultaneously causes duplicate rollup computation (same hour aggregated twice, upserts make the final values correct but the double DB load is wasteful), diverged login rate limit state (each instance has its own counter — an attacker can spread attempts across instances to avoid lockout), and split session visibility if sessions were ever stored in memory rather than the DB. Before scaling horizontally, the worker needs a leader-election or distributed lock mechanism, and the login rate limiter needs a shared backing store (Redis or Postgres).

## Offset pagination on issues

The issues list uses `OFFSET`/`LIMIT` pagination. Postgres must scan and discard all preceding rows to serve a deep page.

- **Mitigation provided**: acceptable at low issue counts.
- **Not protected**: slow queries and high DB CPU as the issues table grows. A page at offset 10,000 requires scanning 10,050 rows. Cursor-based pagination (keyed on `(created_at, id)`) is the correct fix for any table that grows without bound.

## Login brute force

The dashboard login endpoint applies **per-account** rate limiting: an account is locked for 15 minutes after 5 failed attempts (`429` + `Retry-After`).

- **Mitigation provided**: per-account lockout plus Argon2id's ~100ms cost; vague errors prevent enumeration, and unknown emails are counted too so lockout can't probe which accounts exist.
- **Not protected**: distributed guessing spread across many accounts, per-IP abuse (the BFF hides client IPs from Go), and a nuisance lockout-DoS against a known email. Add per-IP throttling at the reverse proxy/WAF. See [security-hardening.md](security-hardening.md) §4.

## Browser security headers

Watch does not emit `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, etc.

- **Mitigation provided**: `HttpOnly` cookies (including the CSRF token) limit what XSS can steal; the BFF keeps the API off the public internet.
- **Not protected**: clickjacking, content sniffing, and the full XSS blast radius without a CSP. Set headers at the reverse proxy — see [security-hardening.md](security-hardening.md) §3.

## Role enforcement

Roles (`owner`, `admin`, `member`, `viewer`) are stored, but per-route role enforcement is not yet wired.

- **Mitigation provided**: every `/api/*` route requires a valid session.
- **Not protected**: separation of duties between dashboard accounts — any authenticated user can perform any dashboard mutation. Issue accounts only to trusted operators until RBAC is enforced. See [security-hardening.md](security-hardening.md) §5.

## Session lifecycle

Sessions last 24h and expired ones are filtered out at lookup, but the session ID is not rotated after login and expired rows are not swept.

- **Mitigation provided**: `HttpOnly`+`Secure`+`SameSite=Lax` cookies and a bounded 24h TTL.
- **Not protected**: session-fixation hardening via post-login rotation, and unbounded growth of expired session rows. Low risk; tracked in [security-hardening.md](security-hardening.md) §4.

## Out of scope for the threat model

Watch does not attempt to defend against:

- Insider threats from operators with database or host access.
- Physical access to the host.
- Compromise of the deploying team's frontend build pipeline (a compromised build can leak data before Watch's redaction sees it).
- Side-channel attacks on the host.

Operators evaluating Watch for regulated environments (financial, healthcare, etc.) should pair this threat model with their own organizational controls.
