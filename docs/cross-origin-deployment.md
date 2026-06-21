# Cross-Origin Deployment

How to run Watch when the dashboard frontend and the Go Dashboard API live on
**different hosts** (e.g. the frontend on Vercel and the API on your own VPS).

The default setup ([auth-model.md](auth-model.md)) is a **backend-for-frontend
(BFF)**: the browser only talks to the TanStack Start server, which forwards
authenticated calls to the Go API over a private, server-to-server hop. Read that
first — most of what follows is about preserving that property, or knowingly
giving it up.

> The short version: **you almost never need true browser→API cross-origin.**
> Keeping the BFF (Option 1) lets the API live anywhere with zero CORS and zero
> cookie changes. Only reach for Options 3/4 if the browser must call the API
> directly.

## Pick the right option

| Your situation | Recommended approach | Cookies | CORS? |
| --- | --- | --- | --- |
| API is remote, but you still run the Start server | **Option 1 — keep the BFF** | unchanged (`HttpOnly; Lax`) | No |
| Frontend + API are subdomains of one domain (`app.example.com` / `api.example.com`) | **Option 2 — shared parent domain** | `Domain=.example.com; Lax` | Yes (credentials) |
| Frontend and API are genuinely different sites (`app.foo.com` / `api.bar.com`) and you want cookies | **Option 3 — `SameSite=None` + CORS** | `SameSite=None; Secure` | Yes (credentials) |
| Different sites and you'd rather not fight third-party cookies | **Option 4 — token auth** | none (Bearer token) | Yes (no credentials) |

Why the preference order: third-party cookies (Option 3) are actively being
restricted by browsers (Safari ITP blocks them today; Chrome is phasing them
out). A cross-**site** cookie is a third-party cookie. So prefer the BFF, a
shared parent domain, or tokens.

---

## Option 1 — Keep the BFF, put the API anywhere (recommended)

Nothing about the auth model changes. The browser still talks only to the Start
server; the Start server reaches the remote Go API server-to-server. There is no
CORS and the cookies stay `HttpOnly`.

The only change is where `INTERNAL_API_URL` points (read in
[`server/request.ts`](../apps/dashboard/src/lib/api/server/request.ts)):

```bash
# Environment for the TanStack Start (Node) deployment
INTERNAL_API_URL=https://api.internal.example.com   # remote Go API, server-only
```

```bash
# Environment for the Go deployment
WATCH_COOKIE_SECURE=true   # behind TLS; keep the Secure attribute on cookies
```

Notes:
- Prefer a **private** address for `INTERNAL_API_URL` (VPC/internal DNS) so the
  API isn't publicly reachable at all. If it must be public, protect it (mTLS,
  network ACLs, or a shared secret header the BFF adds).
- Latency: the BFF hop adds one network round-trip per request. Co-locate the
  Start server and the API in the same region.

This is the least code, the most secure, and works with every browser. Stop here
unless the browser genuinely must call the API directly.

---

## Option 2 — Shared parent domain (best "real" cross-origin)

Serve the frontend at `app.example.com` and the API at `api.example.com`. These
are **different origins** (so you need CORS) but the **same site** (so
`SameSite=Lax` cookies still flow — no third-party-cookie problem). This is the
sweet spot when the browser must call the API directly.

### Go: scope the cookie to the parent domain

In [`auth.go`](../apps/server/internal/api/auth.go), add `Domain` so the cookie
set by `api.example.com` is sent on requests from `app.example.com`:

```go
http.SetCookie(w, &http.Cookie{
    Name:     sessionCookieName,
    Value:    sessionID,
    Domain:   "example.com",          // sent to every *.example.com
    Expires:  expiresAt,
    HttpOnly: true,
    Secure:   a.secureCookie(r),
    SameSite: http.SameSiteLaxMode,    // same-site request → cookie is sent
    Path:     "/",
})
```

Make the domain configurable (e.g. a `WATCH_COOKIE_DOMAIN` env, empty = host-only
as today) rather than hard-coding it.

### Go: CORS for the dashboard origin

Add a CORS middleware that allows exactly the frontend origin and credentials.
See the reusable middleware in [Reference: Go CORS middleware](#reference-go-cors-middleware)
and wrap the dashboard routes with it.

### Frontend: call the API directly with credentials

When the browser calls the API directly you no longer need the BFF transport for
those calls — you call the API origin from the browser. Because `watch_csrf` must
now be readable by JS for the double-submit header, set it **without** `HttpOnly`
(see [CSRF across origins](#csrf-across-origins)).

```ts
// apps/dashboard/src/lib/api/browser-client.ts (cross-origin variant)
const API_URL = import.meta.env.VITE_API_URL // e.g. https://api.example.com

function readCookie(name: string): string | null {
  for (const part of document.cookie.split("; ")) {
    const [k, ...v] = part.split("=")
    if (k === name) return decodeURIComponent(v.join("="))
  }
  return null
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("watch_csrf")
    if (csrf) headers["X-CSRF-Token"] = csrf
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include", // REQUIRED to send/receive the cross-origin cookie
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json() as Promise<T>
}
```

```bash
# Frontend build env — VITE_-prefixed because the browser needs it
VITE_API_URL=https://api.example.com
```

---

## Option 3 — Different sites, cookies via `SameSite=None`

Use this only if the frontend and API are on genuinely different registrable
domains and you still want cookie auth. The cookie becomes a cross-site
(third-party) cookie, which requires `SameSite=None; Secure` **and** is subject
to browser third-party-cookie blocking.

### Go: cookie attributes

```go
http.SetCookie(w, &http.Cookie{
    Name:     sessionCookieName,
    Value:    sessionID,
    Expires:  expiresAt,
    HttpOnly: true,
    Secure:   true,                    // MANDATORY for SameSite=None
    SameSite: http.SameSiteNoneMode,   // allow cross-site send
    Path:     "/",
})
```

`Secure: true` is non-negotiable here — browsers reject `SameSite=None` cookies
without it, so the whole stack must be HTTPS (including local dev; use a tunnel
or local TLS).

### Go: CORS with credentials

Same middleware as Option 2 ([reference below](#reference-go-cors-middleware)) —
`Access-Control-Allow-Origin` must echo the exact frontend origin (never `*` with
credentials) and `Access-Control-Allow-Credentials: true`.

### Frontend

Identical to Option 2's `browser-client.ts` (`credentials: "include"`,
`VITE_API_URL`, CSRF header from the readable cookie).

### The caveat, stated plainly

Safari blocks these cookies by default; Chrome is removing third-party cookies.
If your users are on those browsers, this option will silently stop working. If
you cannot use Option 1 or 2, prefer **Option 4 (tokens)**.

---

## Option 4 — Token auth (cookie-free cross-origin)

Drop cookies entirely for cross-origin. On login the API returns a short-lived
token; the browser holds it **in memory** (not `localStorage`, to limit XSS
blast radius) and sends it as `Authorization: Bearer …`. With no cookies, there
is no CSRF surface, so CORS doesn't need credentials.

This is a larger change to the Go side (issue/verify tokens instead of, or
alongside, sessions) and is sketched here as direction, not a drop-in:

```go
// On login: return the token in the body instead of (only) setting a cookie.
writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": accessToken})

// Auth middleware: accept a bearer token.
authz := r.Header.Get("Authorization")
token, ok := strings.CutPrefix(authz, "Bearer ")
if !ok { writeError(w, http.StatusUnauthorized, "authentication required"); return }
// ...look up the session/token, attach user to context...
```

```ts
// Frontend: keep the token in a module variable; attach it per request.
let accessToken: string | null = null
export const setToken = (t: string | null) => { accessToken = t }

const headers: Record<string, string> = { "Content-Type": "application/json" }
if (accessToken) headers.Authorization = `Bearer ${accessToken}`
await fetch(`${API_URL}${path}`, { method, headers, body }) // no credentials needed
```

Trade-offs: a page refresh loses the in-memory token, so you need a refresh-token
flow (typically a single `HttpOnly` cookie on the API origin used only by a
`/auth/refresh` endpoint) or silent re-login. This is the standard SPA-with-token
pattern; reach for it when cookies are off the table.

---

## CSRF across origins

CSRF protection depends on which transport you chose:

- **BFF (Option 1):** unchanged. `watch_csrf` stays `HttpOnly`; the BFF reads it
  server-side and forwards `X-CSRF-Token`. TanStack Start guards the
  browser→Start hop.
- **Direct browser→API with cookies (Options 2 & 3):** the browser must read the
  token to echo it, so set `watch_csrf` **without** `HttpOnly` and keep the
  double-submit check on the server (compare the `X-CSRF-Token` header to the
  session's stored token). A custom request header like `X-CSRF-Token` also can't
  be sent cross-origin without a successful CORS preflight, which is itself a
  CSRF mitigation.
- **Token auth (Option 4):** no cookies are sent automatically, so there is no
  CSRF vector — you can drop the CSRF cookie and header entirely.

If you switch `watch_csrf` to readable for Options 2/3, do it behind the same
`WATCH_COOKIE_DOMAIN`/mode config you use for the topology, and document that the
token is intentionally JS-readable for the double-submit pattern.

---

## Reference: Go CORS middleware

A small, explicit middleware in the style of
[`middleware.go`](../apps/server/internal/api/middleware.go). It allows a fixed
allowlist of origins, supports credentials, and answers preflight requests.

```go
// cors returns middleware that allows the configured dashboard origins to call
// the API with credentials. Origins must be exact (scheme + host + port); never
// reflect an arbitrary Origin while allowing credentials.
func (a *API) cors(allowed []string) func(http.Handler) http.Handler {
    allowedSet := make(map[string]struct{}, len(allowed))
    for _, o := range allowed {
        allowedSet[o] = struct{}{}
    }
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            if _, ok := allowedSet[origin]; ok {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Access-Control-Allow-Credentials", "true")
                // Vary so caches don't serve one origin's response to another.
                w.Header().Add("Vary", "Origin")
            }
            if r.Method == http.MethodOptions {
                // Preflight. Only answer if the origin is allowed.
                if _, ok := allowedSet[origin]; ok {
                    w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
                    w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
                    w.Header().Set("Access-Control-Max-Age", "600")
                }
                w.WriteHeader(http.StatusNoContent)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

Wire it into the dashboard routes (not ingestion, which has its own origin
allowlist) in [`api.go`](../apps/server/internal/api/api.go). Source the origins
from config, e.g. a `WATCH_DASHBOARD_ORIGINS` comma-separated env validated at
startup:

```go
// inside Handler(), wrapping the session/CSRF-protected dashboard subtree
mux.Handle("/api/", a.cors(cfg.DashboardOrigins)(a.sessionRequired(a.csrfProtected(apiMux))))
mux.Handle("GET /me", a.cors(cfg.DashboardOrigins)(a.sessionRequired(http.HandlerFunc(a.handleMe))))
// /auth/login and /auth/logout also need the cors wrapper so the browser can
// set/clear the cookie cross-origin.
```

Rules to keep it safe:
- **Never** combine `Access-Control-Allow-Origin: *` with
  `Access-Control-Allow-Credentials: true` — browsers reject it, and reflecting
  an arbitrary origin with credentials is an account-takeover bug. Echo only
  allowlisted origins.
- Always send `Vary: Origin` when the response depends on the request origin.
- Keep the allowlist in validated startup config so a misconfiguration fails fast.

---

## Security checklist (cross-origin)

- [ ] Everything is HTTPS; `WATCH_COOKIE_SECURE=true` in production.
- [ ] `Access-Control-Allow-Origin` echoes an allowlisted origin, never `*` with credentials.
- [ ] `Vary: Origin` is set on CORS responses.
- [ ] Cookies use the narrowest scope that works (`Lax` + parent `Domain` for Option 2; `None; Secure` only when truly cross-site).
- [ ] CSRF: double-submit header for cookie options; none needed for token auth.
- [ ] The API is not needlessly public — prefer a private address for the BFF hop.
- [ ] You've confirmed the chosen option works in Safari and Chrome (third-party-cookie behavior).
```
