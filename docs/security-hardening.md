# Security Hardening Guide

Watch ships with secure defaults, but **self-hosting is a shared responsibility
model**: some controls live in the application, others are yours to configure at
the OS, network, database, and reverse-proxy layers. This guide is the operator's
checklist for running Watch securely — written to be useful for any organization,
with extra notes for regulated environments (finance, healthcare, etc.).

Each item is tagged:

- **[built-in]** — Watch does this for you.
- **[operator]** — you must configure it; Watch can't.
- **[gap]** — not implemented yet; compensate at another layer and track it.

Companion docs: [auth-model.md](auth-model.md) (auth + CSRF design and the CSRF
explainer), [security-privacy.md](security-privacy.md) (data collection/redaction
controls), [threat-model.md](threat-model.md) (what Watch does *not* defend
against).

---

## 1. Shared responsibility at a glance

| Layer | Watch provides | You provide |
| --- | --- | --- |
| App auth | Argon2id, session + CSRF cookies, vague login errors | MFA/SSO (via proxy), login rate-limiting (proxy/WAF) |
| Transport | `Secure` cookie flag (`WATCH_COOKIE_SECURE`) | TLS certs, HTTPS termination, HSTS |
| HTTP headers | X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS | CSP at the proxy (in-app CSP is a follow-up) |
| Data | redaction, retention, size caps | encryption at rest, backups, DB access control |
| Network | BFF keeps the API internal | firewall, segmentation, non-root runtime |
| Supply chain | signed SDK releases | lockfiles, image scanning, update cadence |

---

## 2. Transport security (TLS)

- **[operator]** Terminate **HTTPS** in front of everything. Cookies, CSRF, and
  session security all assume an encrypted channel.
- **[built-in]** Set `WATCH_COOKIE_SECURE=true` in production so auth cookies
  carry the `Secure` flag even though Go sits behind a TLS-terminating proxy (it
  sees plain HTTP). See [auth-model.md](auth-model.md).
- **[operator] HSTS** — Watch does not emit `Strict-Transport-Security`. Add it at
  the proxy so browsers refuse to downgrade to HTTP:
  ```
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  ```
- **[operator]** Use TLS for the **Postgres** connection in production
  (`sslmode=require` or stricter in `DATABASE_URL`); `sslmode=disable` is for
  local dev only.

## 3. HTTP security headers

- **[built-in]** The dashboard (Nitro) sets these on every response, via
  `routeRules` in `apps/dashboard/vite.config.ts` (kept out of `src/start.ts` so
  Start's auto-CSRF middleware isn't displaced):
  ```
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains   (honored only over HTTPS)
  ```
  `X-Frame-Options: DENY` blocks clickjacking; `nosniff` blocks content-type
  sniffing; HSTS (in prod) stops protocol downgrade.

- **[gap] Content-Security-Policy** — not set yet. A strict CSP is the strongest
  XSS mitigation (and what makes the `HttpOnly` CSRF cookie matter — see the CSRF
  explainer in [auth-model.md](auth-model.md)), but the app emits an inline theme
  script and inline hydration scripts, so a strict policy needs nonce/hash
  plumbing through SSR. Until that lands, set a CSP at the reverse proxy, e.g.:
  ```
  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'
  ```
  (Tighten `script-src` away from `'unsafe-inline'` once nonces are in place.)

## 4. Authentication & session management

- **[built-in]** Passwords hashed with **Argon2id** (64 MB, t=3, p=4),
  constant-time verification.
- **[built-in]** Login returns a deliberately **vague error** ("invalid email or
  password") to prevent account enumeration.
- **[built-in]** Session + CSRF via **`HttpOnly`, `Secure`, `SameSite=Lax`**
  cookies; CSRF enforced on all non-safe methods. Design + rationale in
  [auth-model.md](auth-model.md).
- **[built-in]** Request bodies capped (`MaxBytesReader`, 1 MiB on auth routes).
- **[built-in]** Sessions expire after 24h; expired sessions are invisible
  (`LookupSession` filters `expires_at > now()`).
- **[built-in] Per-account login throttling** — `/auth/login` locks an account
  after 5 failed attempts within a 15-minute window, returning `429` with a
  `Retry-After` header; a successful login clears the counter. It is keyed by
  email (the BFF hides the real client IP from Go), and unknown emails are counted
  too so lockout can't be used to probe which accounts exist. Add **per-IP**
  throttling at the proxy/WAF for defense in depth. (In-memory; a multi-instance
  deployment would need a shared store.)
- **[gap] MFA / SSO** — not in v1. Compensate with an authenticating reverse
  proxy (oauth2-proxy, SSO gateway), VPN, or IP allowlists. The user model is
  built to accept OIDC/trusted-header auth later.
- **[gap] Session rotation** — the session ID is not rotated after login, and
  expired session rows are not swept (only expired *events* are). Low risk given
  `HttpOnly`+`Secure`+`SameSite` and the 24h TTL, but track it; a periodic
  `DELETE FROM sessions WHERE expires_at < now()` job is the eventual fix.

## 5. Authorization (RBAC) **[gap]**

- **[built-in]** Roles exist on the user model: `owner`, `admin`, `member`,
  `viewer`, and every `/api/*` route requires a valid session.
- **[gap]** Per-route **role enforcement** is not wired yet — any authenticated
  user can call any dashboard mutation. Until it lands, treat *every* dashboard
  account as privileged: only issue accounts to trusted operators, and don't rely
  on roles for separation of duties. (Note: multi-user creation itself isn't built
  yet either — only the first owner via `/setup`.)

## 6. Ingestion security

The SDK→server boundary is separate from dashboard auth (a leaked ingestion key
never grants dashboard access).

- **[built-in]** Project/environment-scoped keys, rotation, revocation, **origin
  allowlists**, schema validation, payload size caps, and **server-side
  redaction**. Details in [security-privacy.md](security-privacy.md).
- **[gap] Per-key rate limiting** — not yet implemented. The ingest handler
  accepts events at whatever rate the caller sends. Compensate with a WAF or
  CDN-level rate limiter in front of `/ingest` until application-level limiting
  lands. This is the highest-priority ingestion gap.
- **[gap] Event deduplication** — no client-generated event ID; SDK retries
  produce duplicate raw events. Error counts and metric samples are inflated
  on network instability. Fix: add a stable `sdk_event_id` UUID per event,
  store it in `raw_events`, and deduplicate on insert with a unique constraint.
  See [threat-model.md](threat-model.md) for the full analysis.
- **[operator]** If the ingestion endpoint is public, front it with a WAF/CDN
  rate limiter regardless of the per-key gap above — application-level limits
  do not stop distributed abuse.

## 7. Data protection & privacy

- **[built-in]** Default-deny on sensitive fields; three-layer redaction (SDK,
  ingestion, project config); configurable retention; pseudonymous user identity
  only. See [security-privacy.md](security-privacy.md).
- **[operator] Encryption at rest** — Watch stores raw events in Postgres in the
  clear. Enable disk/volume encryption and encrypt backups.
- **[operator] Least-privilege DB user** — the app's Postgres role needs DML on
  its tables, not superuser. Don't reuse the `postgres` superuser in production.
- **[operator] Backups** — encrypt them and restrict access; they contain every
  event ever ingested.
- **[operator] Source maps** (if used) are sensitive (they de-minify your
  bundles); keep the artifact store private.

## 8. Secrets management

- **[operator]** Provide `DATABASE_URL` and other secrets via the environment or a
  secrets manager — **never commit them**. (`apps/server/package.json`'s `dev`
  script hardcodes the *local* compose DSN for convenience only; production uses
  the built binary with real env, never `air`.)
- **[built-in]** The DB password is **redacted in logs**
  (`RedactedDatabaseURL()`); structured logs avoid secrets, tokens, and payload
  bodies. Keep it that way when adding logging.
- **[operator]** Rotate DB credentials and any future API secrets on a schedule.

## 9. Network & deployment hardening

- **[built-in]** The **BFF keeps the Go API internal** — the browser only talks to
  the Start server, so the API needs no CORS and can be firewalled off the public
  internet entirely. Bind it to a private interface / put it on an internal
  network; expose only the dashboard (and the public `/ingest` endpoint).
- **[operator]** Run containers as a **non-root** user; use read-only root
  filesystems where possible; drop Linux capabilities.
- **[operator]** Segment the network: dashboard ⇄ internal API ⇄ Postgres, with
  Postgres not reachable from the public internet.
- **[operator]** Put a reverse proxy / WAF in front (TLS, HSTS, security headers,
  rate limiting) — it's where several **[gap]** items above are best handled today.

### Restricting dashboard access by network

Watch's application-level auth (password login, sessions, roles) controls *who* can
use the dashboard once they reach it. If you want to control *which machines or
networks* can reach Watch at all, that is an infrastructure concern — Watch has no
built-in IP allowlist, but it is straightforward to add one at any of the layers below.

> **`/ingest` caveat.** The SDK runs in your users' browsers, so the ingestion
> endpoint must stay reachable from wherever those browsers are — typically the public
> internet. If your dashboard and ingestion are on the same host/port, apply IP
> restrictions *only to the dashboard paths* at the reverse proxy, not to
> `/ingest`. If you want a clean split, run ingestion on a separate hostname or
> container and firewall the dashboard host entirely.

**Tier 1 — Firewall / security-group rules** (cloud or on-prem)

Restrict ingress to ports 443/80 on the dashboard host to known CIDRs — your office
ranges, VPN egress IPs, or build-agent addresses. This is the lowest-effort option and
works at the infrastructure level before any packet touches Watch.

```
# AWS security group — allow HTTPS only from office + VPN egress
Type: HTTPS  Protocol: TCP  Port: 443  Source: 203.0.113.0/24  # office
Type: HTTPS  Protocol: TCP  Port: 443  Source: 198.51.100.5/32 # VPN egress
```

Update the allowlist when IPs change (dynamic IPs are a maintenance burden here —
consider Tier 3 instead).

**Tier 2 — Reverse proxy IP allowlist** (nginx / Caddy / Traefik)

If you need path-level control (restrict `/` but not `/ingest`), enforce it at the
reverse proxy. Examples:

```nginx
# nginx — allow dashboard to trusted CIDRs only; pass /ingest to anyone
location /ingest {
    proxy_pass http://watch:3000;
}

location / {
    allow 203.0.113.0/24;  # office
    allow 198.51.100.5;    # VPN egress
    deny  all;
    proxy_pass http://watch:3000;
}
```

```
# Caddy — route-based IP restriction
handle /ingest* {
    reverse_proxy watch:3000
}
handle {
    @blocked not remote_ip 203.0.113.0/24 198.51.100.5/32
    respond @blocked 403
    reverse_proxy watch:3000
}
```

Traefik users: use the `ipAllowList` middleware on the dashboard router, not on the
ingestion router.

**Tier 3 — VPN / zero-trust network access** (recommended for high-security deployments)

Put the Watch host on a private network (no public ingress at all) and require every
operator to connect via VPN before they can reach the dashboard. This removes the
public attack surface entirely — no login page visible to the internet, no rate-limit
evasion possible.

Common options, roughly in order of ops overhead:

| Option | Notes |
|---|---|
| **Tailscale** | Zero-config WireGuard mesh; `tailscale serve` can expose Watch only on the tailnet. Low ops, good for small teams. |
| **WireGuard** (self-managed) | Standard, widely supported; more setup than Tailscale but no third-party control plane. |
| **Cloudflare Access / ZeroTrust** | OIDC-based; adds MFA and identity-aware access on top of network restriction. Good if you are already in the Cloudflare ecosystem. |
| **Internal VPC only** | On AWS/GCP/Azure, put Watch in a private subnet with no internet gateway; access via VPN or bastion. Classic pattern for internal tooling. |

If your monitored apps are public, split ingestion onto a separate public hostname and
keep the dashboard on the private tailnet or VPN — operators connect to
`watch-internal.company.com` via VPN; the SDK points to
`ingest.company.com` which is public.

## 10. Logging, monitoring & audit

- **[built-in]** One structured access log per request with a request ID
  (`X-Request-Id`); 5xx errors logged with context but a generic client message
  (no internal leaks).
- **[gap] Audit log** — there is no dedicated, tamper-evident audit trail for
  security events (login success/failure, logout, key rotation/revocation, user
  changes). For regulated environments, ship the structured logs to a WORM/SIEM
  sink and track adding first-class audit events.
- **[operator]** Centralize logs, alert on auth failures and 5xx spikes, and watch
  Watch's own self-health (ingestion/worker/DB/alert status).

## 11. Dependencies & supply chain

- **[built-in]** SDK releases are signed; migrations are embedded in the binary.
- **[operator]** Commit lockfiles, scan images/deps (e.g. `govulncheck`, `pnpm
  audit`, Trivy), pin the SDK version, and use Subresource Integrity for any
  externally hosted assets. Keep dependencies current per
  [AGENTS.md](../AGENTS.md) discipline.

## 12. Operational and architectural gaps

These are not security issues in the traditional sense but are architectural risks
that affect reliability, data integrity, and operational stability in production.
They are documented here so operators understand the current limits and can plan
compensating controls.

### Real-time data delay

The rollup worker processes only the **previous complete hour**, not the current
one. New events do not appear in dashboard charts for up to 65 minutes after
they are ingested. The PRD promises "useful data within 1-2 minutes." That
promise is currently unmet. Compensating control: lower the worker interval and
process the current partial hour as well. Live event feeds require SSE
infrastructure (not yet built). Alerts (Milestone 7, unimplemented) are the
most important real-time capability for production on-call.

### Worker memory pressure

The rollup worker fetches all raw events for a one-hour window into memory at
once — no server-side pagination. At 1M events/day that is ~40,000 rows per
batch. The worker runs in the same process as the web server; an OOM kill takes
down both. Monitor RSS under load; add a `LIMIT` + multi-page fetch or
switch to streaming row scanning if event volume grows.

### Missing index for worker queries

Worker queries filter `raw_events` by `(event_type, event_timestamp)`. No
index covers that combination — only `(project_id, received_at)` and
`(environment_id, received_at)` exist. Worker aggregation will do a sequential
scan as the table grows. Add `CREATE INDEX ... ON raw_events (event_type,
event_timestamp)` before high traffic.

### Single-instance constraints

The in-memory login rate limiter and the rollup worker both assume one running
process. Running two instances simultaneously diverges rate-limit state and
causes duplicate worker computation. Do not scale horizontally without adding
a distributed lock (Postgres advisory lock is the lowest-ops option) for the
worker and moving the login limiter to a shared store.

### No server-side event sampling

Every event sent by the SDK is stored. At high event volume (>1M events/day),
storage and worker load grow proportionally. Neither the SDK nor the server
supports a server-side sampling rate today. For high-traffic apps, implement
a configurable head-based sampling rate (e.g., store 10% of `web_vital` events
while keeping 100% of `frontend_error` events) before raw_events outgrows
the host.

---

## 13. Operator quick checklist

Before exposing Watch to real traffic:

- [ ] HTTPS everywhere; `WATCH_COOKIE_SECURE=true`; HSTS at the proxy.
- [ ] CSP at the proxy (X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy/HSTS are set by the app).
- [ ] Per-IP login throttling at the proxy/WAF (the app provides per-account lockout).
- [ ] Postgres: TLS (`sslmode=require`+), least-privilege user, encryption at rest, encrypted backups.
- [ ] Secrets via env/secrets manager; nothing committed; DB creds rotated.
- [ ] Go API bound to a private network; only the dashboard + `/ingest` exposed.
- [ ] If dashboard should not be public: IP allowlist or VPN/zero-trust gate at the reverse proxy or firewall; keep `/ingest` open only to monitored app origins (see §9).
- [ ] WAF or CDN rate limiter in front of `/ingest` until per-key application rate limiting is implemented (see §6).
- [ ] Worker memory and index risks reviewed against expected daily event volume (see §12).
- [ ] Containers run non-root; network segmented.
- [ ] Logs centralized; alerts on auth failures / 5xx; consider a SIEM for audit.
- [ ] Only trusted operators have dashboard accounts (per-route RBAC not enforced yet).
- [ ] Dependency/image scanning in CI; SDK version pinned.

> Regulated deployments: pair this guide with your own organizational controls
> (access reviews, key management, incident response). Watch is one layer, not a
> complete compliance program — see the limits in
> [threat-model.md](threat-model.md).
