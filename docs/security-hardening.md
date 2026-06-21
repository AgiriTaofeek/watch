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

- **[built-in]** Project/environment-scoped keys, rotation, revocation, per-key
  rate limiting, **origin allowlists**, schema validation, payload size caps, and
  **server-side redaction**. Details in [security-privacy.md](security-privacy.md).
- **[operator]** If the ingestion endpoint is public, front it with a WAF/CDN rate
  limiter — per-key limits don't stop distributed abuse (see
  [threat-model.md](threat-model.md)).

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

---

## 12. Operator quick checklist

Before exposing Watch to real traffic:

- [ ] HTTPS everywhere; `WATCH_COOKIE_SECURE=true`; HSTS at the proxy.
- [ ] CSP at the proxy (X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy/HSTS are set by the app).
- [ ] Per-IP login throttling at the proxy/WAF (the app provides per-account lockout).
- [ ] Postgres: TLS (`sslmode=require`+), least-privilege user, encryption at rest, encrypted backups.
- [ ] Secrets via env/secrets manager; nothing committed; DB creds rotated.
- [ ] Go API bound to a private network; only the dashboard + `/ingest` exposed.
- [ ] Containers run non-root; network segmented.
- [ ] Logs centralized; alerts on auth failures / 5xx; consider a SIEM for audit.
- [ ] Only trusted operators have dashboard accounts (per-route RBAC not enforced yet).
- [ ] Dependency/image scanning in CI; SDK version pinned.

> Regulated deployments: pair this guide with your own organizational controls
> (access reviews, key management, incident response). Watch is one layer, not a
> complete compliance program — see the limits in
> [threat-model.md](threat-model.md).
