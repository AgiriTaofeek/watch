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
| HTTP headers | — | CSP, frame-ancestors, etc. at the proxy **[gap]** |
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

## 3. HTTP security headers **[gap]**

Watch does **not** currently set browser security headers. Set them at your
reverse proxy (or add a small Go middleware later). Recommended baseline for the
dashboard origin:

```
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Notes:
- `frame-ancestors 'none'` / `X-Frame-Options: DENY` prevent clickjacking by
  blocking the dashboard from being framed.
- A strict CSP is the strongest mitigation against XSS (which is also what makes
  the `HttpOnly` CSRF cookie matter — see the CSRF explainer in
  [auth-model.md](auth-model.md)). Tune `script-src`/`style-src` to the assets the
  dashboard actually loads; test before enforcing.

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
- **[gap] Login brute-force / lockout** — there is no per-account or per-IP rate
  limit on `/auth/login`. Until added, throttle it at the proxy/WAF (e.g. N
  attempts/min/IP) and consider fail2ban-style banning on repeated 401s.
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
- [ ] Security headers (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`) at the proxy.
- [ ] Login rate-limiting at the proxy/WAF (no app-level brute-force protection yet).
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
