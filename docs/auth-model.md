# Auth Model

Watch has three separate authentication and identity concerns.

Keeping these separate is important.

```txt
1. Dashboard auth
   Who can log into Watch?

2. Monitored app user identity
   Which frontend user or session was affected?

3. Ingestion auth
   Is this browser allowed to send telemetry for this project?
```

## Dashboard Auth

Dashboard auth controls access to the Watch dashboard and Dashboard API.

Examples:

- Viewing issues
- Creating projects
- Managing users
- Rotating ingestion keys
- Changing retention settings
- Configuring alerts

V1 implements local dashboard auth only.

External dashboard auth modes are intentionally deferred. The data model should leave room for them later, but they are not part of the first implementation.

### Local Auth

Local auth is the default mode.

It lets Watch work out of the box without depending on any external auth provider.

Expected behavior:

- First admin created during setup
- Invite-only user creation
- Password hashing with Argon2id or bcrypt
- Secure session cookies
- CSRF protection for mutations
- Roles: `owner`, `admin`, `member`, `viewer`

Example config:

```txt
WATCH_AUTH_MODE=local
WATCH_COOKIE_SECURE=auto
```

`WATCH_COOKIE_SECURE` controls the `Secure` attribute on dashboard session
cookies:

- `auto` — secure only when the Go server receives HTTPS directly.
- `true` — always secure; use this in production behind TLS-terminating proxies.
- `false` — never secure; use only for local plain-HTTP development.

#### Architecture: the dashboard is a BFF

The dashboard is a TanStack Start app that renders on the server for the first
load and behaves as a client SPA afterwards. The browser **only ever talks to
the Start (Nitro) server** — it is the single browser-facing origin. The Go
Dashboard API is an internal service the browser never reaches directly. Start
acts as a backend-for-frontend (BFF): every Go call is wrapped in a TanStack
*server function* that forwards the request to Go and relays the result back.

```txt
            (browser-facing origin)        (internal)
  Browser ───────────────────────► TanStack Start (Nitro) ───────► Go API ───► Postgres
          server functions / SSR        forwards Cookie +              session,
          (the only origin the          X-CSRF-Token, relays          CSRF, CRUD
           browser calls)               Go's Set-Cookie back
```

The single browser-facing transport lives in
`apps/dashboard/src/lib/api/server/request.ts`. Because the browser never calls
Go, the Go API needs **no CORS** and the dashboard needs no client-side API
origin. (The browser SDK's `/ingest` endpoint is a separate, public boundary
with its own origin allowlist — see [Ingestion Auth](#ingestion-auth).)

#### Understanding CSRF (and why there is a token cookie)

CSRF (Cross-Site Request Forgery) abuses one browser behavior: the browser
attaches a site's cookies to **every** request to that site — including requests
triggered by a *different*, malicious site. The attack:

1. You log into `watch.example.com`; the browser stores your session cookie.
2. While still logged in, you visit `evil.example`.
3. That page contains
   `<form action="https://watch.example.com/api/projects" method="POST">` that
   auto-submits (or a `fetch`). The browser, seeing a request *to*
   `watch.example.com`, **attaches your session cookie automatically**.
4. With no extra defense, Watch sees a valid session and performs the action —
   a state change you never intended.

The cookie alone cannot distinguish "request from the real Watch UI" from
"request forged by `evil.example`," because the cookie is sent in both cases.

**The defense is a secret the attacker cannot read or guess.** The server issues
a random **CSRF token** bound to your session. The real Watch UI knows it and
sends it back in a custom header (`X-CSRF-Token`) on every state-changing
request; the server acts only if the header matches the session's token.

Why that stops the attack:

- A malicious site can make the browser *send* cookies, but it cannot *read*
  Watch's cookies or response bodies — the browser's **Same-Origin Policy** blocks
  cross-origin reads. So it never learns the token.
- It also cannot attach a custom `X-CSRF-Token` header on a cross-origin request
  without triggering a CORS **preflight** that Watch won't approve.

So a forged request arrives with the cookie but the **wrong/missing token** → 403.

Two classic token strategies:

- **Synchronizer token** — the server stores the token server-side (in the
  session row) and compares. Watch does this; the session's `csrf_token` is the
  source of truth.
- **Double-submit cookie** — the server also puts the token in a *readable*
  cookie; the client echoes it in the header; the server compares header to
  cookie. Survives reloads without server-side storage.

**Watch's BFF combines both ideas while keeping the token out of JavaScript
entirely:** Go stores the token in the session row (synchronizer) *and* sets it
as the `watch_csrf` cookie — but that cookie is **`HttpOnly`**. The browser never
reads it; the only reader is the BFF (Start server), which reads it *server-side*
and forwards it as `X-CSRF-Token` when calling Go. The "double submit" happens on
the trusted Start→Go hop, not in the browser. The browser→Start hop is separately
protected by TanStack Start's own same-origin CSRF check.

**Why `HttpOnly` matters here:** if an attacker ever lands an XSS payload in the
dashboard, an `HttpOnly` token cookie cannot be stolen by injected JavaScript —
unlike a readable double-submit cookie. For security-sensitive (e.g. fintech)
deployments this makes the BFF design stronger than a classic browser-side
double-submit. (For the request-by-request trace, see
[request-lifecycle.md](request-lifecycle.md).)

#### Session and CSRF cookies

Login sets two cookies, both `HttpOnly`, `SameSite=Lax`, `Path=/`:

- `watch_session` — opaque session ID. Go resolves the session and user from it
  on every request.
- `watch_csrf` — the session's CSRF token. It is `HttpOnly` because **JavaScript
  never needs to read it**: the BFF server reads it server-side from the incoming
  cookie and echoes it in the `X-CSRF-Token` header when calling Go on non-safe
  methods (POST/PUT/PATCH/DELETE). Go validates the header against the token
  stored in the session row, which stays the source of truth.

Because both cookies live on the Start origin (Go's `Set-Cookie` is relayed by
the BFF on login), they survive a full page reload: after a refresh the SSR
bootstrap restores the user from `watch_session`, and the first mutation still
finds `watch_csrf` to forward.

CSRF is defended in two layers: TanStack Start's built-in CSRF protection guards
the browser→Start server-function calls, and the forwarded `X-CSRF-Token` guards
the Start→Go hop.

Logout clears both cookies (Go clears them; the BFF relays the clearing headers).

#### Deployment topology

Production runs **two processes**: the Node/Nitro server that serves the
dashboard (the browser-facing front door) and the Go binary (internal API +
ingestion + worker), plus Postgres. The Start server reaches Go via
`INTERNAL_API_URL` (default `http://localhost:8080`); point it at the internal
address of the Go service.

Set `WATCH_COOKIE_SECURE=true` in production so cookies keep the `Secure`
attribute even though Go terminates plain HTTP behind the Node front door / a TLS
proxy.

> Packaging this two-process stack into `docker compose up -d` (a `dashboard`
> Node service + a `watch` Go service) is tracked as follow-up work; today the
> compose file provisions Postgres only.

Locally: run the Go server (`:8080`) and `pnpm --filter dashboard dev`
(`:3000`). The browser talks only to `:3000`; server functions reach Go
server-side via `INTERNAL_API_URL`. No dev proxy is needed.

> Deploying the frontend and API on **different hosts** (e.g. frontend on a CDN,
> API on your VPS)? See [cross-origin-deployment.md](cross-origin-deployment.md)
> for the options — keeping the BFF with a remote `INTERNAL_API_URL`, a shared
> parent domain, `SameSite=None` + CORS, or token auth — with code samples.

### OIDC Auth

Status: future roadmap, not v1.

OIDC auth lets companies use an existing identity provider.

Possible providers:

- Keycloak
- Okta
- Azure AD
- Google Workspace
- Internal OIDC providers

Watch should trust the OIDC provider for login, then map claims to Watch users and roles.

Example config:

```txt
WATCH_AUTH_MODE=oidc
WATCH_OIDC_ISSUER=https://idp.company.com
WATCH_OIDC_CLIENT_ID=watch
WATCH_OIDC_CLIENT_SECRET=...
```

Role mapping can use claims such as groups.

Example:

```txt
watch-admins -> admin
watch-viewers -> viewer
```

### Trusted Header Auth

Status: future roadmap, not v1.

Trusted header auth supports companies that already protect internal tools behind a reverse proxy, gateway, or access layer.

Examples:

- oauth2-proxy
- Internal API gateway
- Tailscale or private network access layer
- Company SSO middleware

The proxy authenticates the user and forwards identity headers to Watch.

Example headers:

```txt
X-Forwarded-User: jane@company.com
X-Forwarded-Name: Jane Doe
X-Forwarded-Groups: frontend,watch-admins
```

Example config:

```txt
WATCH_AUTH_MODE=trusted_header
WATCH_TRUSTED_PROXY_CIDRS=10.0.0.0/8
WATCH_AUTH_HEADER_EMAIL=X-Forwarded-User
WATCH_AUTH_HEADER_NAME=X-Forwarded-Name
WATCH_AUTH_HEADER_GROUPS=X-Forwarded-Groups
```

Trusted header auth must be disabled by default.

It is only safe when Watch is reachable directly from trusted proxies. If users can send these headers directly to Watch, they can impersonate dashboard users.

## Monitored App User Identity

Watch should not verify the monitored frontend application's users.

The monitored app already has its own auth system. Watch only needs optional pseudonymous identity so developers can understand user impact.

Example:

```ts
watch.setUser({
  idHash: "hash-of-internal-user-id",
  role: "customer"
})
```

Default rule:

- Do not send raw user IDs
- Do not send emails
- Do not send names
- Do not send account numbers
- Do not send phone numbers
- Do not send transaction identifiers

Allowed by default:

- `userIdHash`
- coarse role or segment, such as `customer`, `merchant`, or `admin`
- anonymous session ID generated by the SDK

The monitored app owns identity verification. Watch only stores safe impact metadata.

## Ingestion Auth

Ingestion auth controls whether browser telemetry can be accepted for a project.

The browser SDK sends events using a project- and environment-scoped ingestion key.

This is not a user login token.

This is not a dashboard session.

This is not proof that a real authenticated app user sent the event.

An ingestion key only answers:

```txt
Is this event allowed to be submitted to this Watch project/environment?
```

Ingestion controls:

- Project-scoped browser key
- Environment scoping
- Allowed origins
- Rate limits
- Key rotation
- Key revocation
- Payload validation
- Server-side redaction

## Recommended V1 Behavior

V1 ships with local auth only.

Do not implement OIDC auth in v1.

Do not implement trusted header auth in v1.

Keep OIDC and trusted header auth as future roadmap items.

Future order after v1:

1. Trusted header auth
2. OIDC auth

The data model should not assume local passwords are the only identity source.

User records should support:

- Email
- Display name
- Role
- Auth provider
- External subject ID
- Created timestamp
- Last login timestamp

## Summary

```txt
Dashboard auth:
  Controls who can use Watch.
  V1 implements local auth only.
  OIDC and trusted header auth are future roadmap items.

Monitored app user identity:
  Optional pseudonymous impact metadata from the frontend app.
  Watch does not verify these users.

Ingestion auth:
  Project key that lets the browser SDK submit events.
  Does not grant dashboard access.
```
