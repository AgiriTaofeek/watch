# Request Lifecycle — what happens when a user visits `watch.com.ng`

This is the deep, end-to-end walkthrough of a request to the Watch dashboard:
from typing `watch.com.ng` in the address bar to a fully interactive, possibly
authenticated dashboard, and what every later click does. It is intentionally
exhaustive.

It assumes the architecture in [auth-model.md](auth-model.md) and
[architecture.md](architecture.md): the dashboard is a **TanStack Start (Nitro)
server** acting as a backend-for-frontend (BFF) in front of an internal **Go
API**, with **Postgres** behind Go.

## Cast of characters

```txt
  ┌────────────┐      HTTPS / public        ┌──────────────────────────┐   private    ┌──────────┐   ┌──────────┐
  │  Browser   │ ─────────────────────────► │  TanStack Start (Nitro)  │ ───────────► │  Go API  │ ─►│ Postgres │
  │ watch.com  │ ◄───────────────────────── │  watch.com.ng  (BFF)     │ ◄─────────── │ internal │   │          │
  │  .ng       │   HTML, JS, RPC, cookies   │  SSR + server functions  │  cookie +    │          │   │          │
  └────────────┘                            └──────────────────────────┘  X-CSRF-Token└──────────┘   └──────────┘
        ▲                                                                    relay Set-Cookie
        └─ the ONLY origin the browser ever talks to. Go is never reached directly; it needs no CORS.
```

Key files referenced throughout:
- Server entry / router: [`src/router.tsx`](../apps/dashboard/src/router.tsx)
- QueryClient per request: [`integrations/tanstack-query/root-provider.tsx`](../apps/dashboard/src/integrations/tanstack-query/root-provider.tsx)
- Root route + SSR bootstrap: [`src/routes/__root.tsx`](../apps/dashboard/src/routes/__root.tsx)
- Route guards: [`_auth.tsx`](../apps/dashboard/src/routes/_auth.tsx), [`_protected.tsx`](../apps/dashboard/src/routes/_protected.tsx)
- Auth query: [`lib/api/queries.ts`](../apps/dashboard/src/lib/api/queries.ts)
- Server functions: [`lib/api/auth.ts`](../apps/dashboard/src/lib/api/auth.ts) (and `projects.ts`, etc.)
- BFF transport: [`lib/api/server/request.ts`](../apps/dashboard/src/lib/api/server/request.ts)
- Go routing + middleware: [`api.go`](../apps/server/internal/api/api.go), [`middleware.go`](../apps/server/internal/api/middleware.go), [`authmiddleware.go`](../apps/server/internal/api/authmiddleware.go), [`auth.go`](../apps/server/internal/api/auth.go)

---

## Act 1 — Getting the bytes to the browser (network plumbing)

### 1. DNS resolution
The browser needs an IP for `watch.com.ng`.
1. Checks its own cache, then the OS resolver cache, then asks a recursive
   resolver (your ISP / `1.1.1.1` / `8.8.8.8`).
2. The recursive resolver walks the hierarchy if uncached: root nameservers →
   `.ng` TLD nameservers → the authoritative nameserver for `watch.com.ng` →
   returns the `A`/`AAAA` record (the public IP of the host running the Start
   server, or a CDN/load-balancer edge in front of it).
3. The IP is cached for the record's TTL.

### 2. TCP + TLS handshake
1. The browser opens a TCP connection to that IP on port **443**.
2. TLS handshake: `ClientHello` (SNI = `watch.com.ng`, supported ciphers) →
   `ServerHello` + certificate chain → key exchange → encrypted channel. The cert
   is validated against the browser's trust store. HTTP/2 (or HTTP/3 over QUIC) is
   typically negotiated via ALPN.
3. Everything after this point is encrypted in transit — part of the privacy-first
   posture: production must be HTTPS, and Go sets `Secure` cookies
   (`WATCH_COOKIE_SECURE=true`).

### 3. The HTTP request
The browser sends:
```http
GET / HTTP/2
Host: watch.com.ng
Cookie: <none on a first-ever visit>
Accept: text/html,...
User-Agent: ...
```
This arrives at the **TanStack Start (Nitro) server** (possibly via a TLS-
terminating reverse proxy / CDN edge). This Node process is the front door. The
Go API is **not** on this path from the browser's perspective.

---

## Act 2 — Server-side render (first, cold, unauthenticated load)

The Nitro request handler invokes the TanStack Start handler, which builds a
**fresh router per request** ([`getRouter()`](../apps/dashboard/src/router.tsx)).

### 4. A fresh, isolated QueryClient
`getRouter()` calls `getContext()`
([root-provider.tsx](../apps/dashboard/src/integrations/tanstack-query/root-provider.tsx)),
which creates a **new `QueryClient` for this request**. This isolation is
critical on the server: two concurrent users' requests never share cache, so one
user's `me` data can't bleed into another's render. `setupRouterSsrQueryIntegration`
wires this QueryClient into the router so query data dehydrates into the HTML and
rehydrates on the client.

### 5. Route matching + locale
The router matches the URL path against `routeTree.gen.ts`. Paraglide's `url`
strategy ([vite.config.ts](../apps/dashboard/vite.config.ts) `strategy: ["url",
"baseLocale"]`) extracts the locale from the URL (falling back to the base
locale), so `getLocale()` resolves the language for this render.

For `/`, the matching chain is: **root** (`__root.tsx`) → **`_protected`**
(a pathless layout) → **`_protected/index`** (the dashboard home, which owns path
`/`). Before any component renders, the `beforeLoad` chain runs **top-down on the
server**.

### 6. Root `beforeLoad` resolves the user (the BFF in action — SSR side)
[`__root.tsx`](../apps/dashboard/src/routes/__root.tsx) `beforeLoad`:
```ts
const user = await context.queryClient.ensureQueryData(meQueryOptions())
return { user }
```
- `meQueryOptions()` ([queries.ts](../apps/dashboard/src/lib/api/queries.ts)) has
  `queryKey: ["me"]` and `queryFn: () => fetchMe()`.
- `fetchMe` ([auth.ts](../apps/dashboard/src/lib/api/auth.ts)) is a **server
  function**. During SSR it executes **in-process on the Start server** (no extra
  network hop to itself) and calls `serverRequest("GET", "/me")`.

### 7. `serverRequest` → Go (the private hop)
[`server/request.ts`](../apps/dashboard/src/lib/api/server/request.ts):
1. `getRequestHeader("cookie")` — on a first visit this is **empty**.
2. `GET` is a safe method, so no `X-CSRF-Token` is attached.
3. `fetch(\`${INTERNAL_API_URL}/me\`, { headers: { cookie: "" }, signal: AbortSignal.timeout(5000) })`
   — a server-to-server call to the internal Go address, bounded by a 5s timeout.

### 8. Inside Go: the middleware chain and `/me`
The request enters Go's mux ([api.go](../apps/server/internal/api/api.go)), wrapped
outer→inner by [middleware.go](../apps/server/internal/api/middleware.go):
1. `requestID` — assigns a random id, sets `X-Request-Id`, stores it in context.
2. `requestLogger` — starts a timer; will emit one structured access-log line.
3. `recoverer` — turns any downstream panic into a logged 500.

Then routing: `GET /me` is registered as
`a.sessionRequired(http.HandlerFunc(a.handleMe))`. `sessionRequired`
([authmiddleware.go](../apps/server/internal/api/authmiddleware.go)):
- Reads the `watch_session` cookie → **absent** → responds **401
  `{"error":"authentication required"}`**. `handleMe` never runs.

### 9. Back up the stack: 401 → `null` → redirect
- `serverRequest` sees `res.status === 401`. There are no `Set-Cookie` headers to
  relay. It throws `ApiError(401, …)`.
- `fetchMe`'s handler catches `ApiError.isUnauthorized` and returns **`null`**.
- `ensureQueryData` caches `null` under `["me"]`. Root `beforeLoad` returns
  `{ user: null }`.
- Next in the chain, **`_protected` `beforeLoad`**
  ([_protected.tsx](../apps/dashboard/src/routes/_protected.tsx)): `if (!context.user)
  throw redirect({ to: "/login" })`.
- During SSR, that thrown `redirect` makes the Start server respond with an HTTP
  redirect to `/login` (rather than rendering the dashboard). The browser
  immediately issues `GET /login`.

### 10. SSR of `/login`
The `/login` request repeats steps 4–6, but the matching chain is root →
**`_auth`** (pathless layout, [`_auth.tsx`](../apps/dashboard/src/routes/_auth.tsx)) →
**`_auth/login`**.
- Root `beforeLoad` again resolves `user` — still `null` (a new request, empty
  cookie; the QueryClient for this request starts empty and `fetchMe` returns
  `null` again).
- `_auth` `beforeLoad`: `if (context.user) throw redirect({ to: "/" })` — user is
  `null`, so **no redirect**; the public layout renders.
- The component tree renders to HTML on the server: `AuthLayout` (centered
  container) wrapping `LoginPage` → `LoginForm`
  ([login-form.tsx](../apps/dashboard/src/features/auth/login-form.tsx)).

### 11. The shell, the anti-flash theme script, and serialization
The whole tree is wrapped by `RootDocument` (the `shellComponent` in
[__root.tsx](../apps/dashboard/src/routes/__root.tsx)): `<html>` with `lang` from
`getLocale()`, a `<head>` containing:
- An **inline theme script** that runs before first paint to set the `light`/`dark`
  class from `localStorage`/`prefers-color-scheme` — this prevents a flash of the
  wrong theme.
- `<HeadContent />` (meta, title "Watch", stylesheet link to `styles.css`).
- `<body>` with the rendered app and `<Scripts />`.

TanStack Start serializes into the streamed HTML:
- The rendered markup (so the user sees the login form immediately).
- The **dehydrated QueryClient** (the `["me"] = null` entry).
- The **router state** (matched routes, loader data) for hydration.

The Start server streams this HTML document back over the TLS connection.

---

## Act 3 — The browser brings it to life (hydration)

### 12. Parse + anti-flash
The browser parses the HTML. The inline theme script executes synchronously in
`<head>` and sets the root class **before** the body paints, so there's no theme
flash.

### 13. First paint
`styles.css` (Tailwind) loads; the browser paints the server-rendered login card.
The user can already **see** the page before any framework JS has run — the SSR
benefit.

### 14. Load + execute JS
The bundles referenced by `<Scripts />` download and execute.

### 15. Hydration
- On the client, `getRouter()` runs again, creating a client-side `QueryClient`
  that is **hydrated** from the dehydrated state in the HTML (so `["me"]` is
  already `null` — no refetch on boot).
- React **hydrates**: it attaches event listeners to the existing SSR DOM instead
  of re-creating it. The page is now a fully interactive SPA. From here,
  navigations are client-side and only **data** crosses the wire, not whole HTML
  documents.

---

## Act 4 — Logging in

(Assume setup is already complete — the first-run `setup` path is described in
[Appendix A](#appendix-a--first-run-setup).)

### 16. The form submit
The user types email + password and clicks **Sign in**. `handleSubmit`
([login-form.tsx](../apps/dashboard/src/features/auth/login-form.tsx)) calls
`login({ data: { email, password } })`.

### 17. A server-function RPC (browser → Start, same origin)
`login` is a server function. On the client, **calling it is an RPC**: the client
serializes the input and `POST`s it to the Start server's server-function endpoint
on **`watch.com.ng`** — the same origin. This is not a call to Go; it's a call to
the BFF.

### 18. TanStack Start's built-in CSRF guard
Because the app defines no `src/start.ts`, TanStack Start auto-installs its CSRF
middleware for server functions. It verifies this browser→Start RPC is a genuine
same-origin call before the handler runs. This is **CSRF layer 1** (browser↔Start).

### 19. The `login` handler forwards to Go
On the Start server, the `login` handler runs `serverRequest("POST",
"/auth/login", data)`:
- `getRequestHeader("cookie")` — still empty (not yet logged in).
- It's a mutating method, so it tries `getCookie("watch_csrf")` — none yet, so no
  `X-CSRF-Token`. (Fine: `/auth/login` is a public Go route with no CSRF
  requirement.)
- `fetch(\`${INTERNAL_API_URL}/auth/login\`, { method: "POST", body })`.

### 20. Inside Go: authenticate + mint session
`POST /auth/login` is public (no session/CSRF middleware). `handleLogin`
([auth.go](../apps/server/internal/api/auth.go)):
1. Decodes `{email, password}` (body capped at 1 MiB via `MaxBytesReader`).
2. `GetUserByEmail` (email lowercased). If not found → **401 with a deliberately
   vague message** ("invalid email or password") so emails can't be enumerated.
3. `VerifyPassword` — Argon2id, constant-time compare. Mismatch → same vague 401.
4. `NewToken(32)` twice → a session id and a CSRF token (256 bits each).
5. `CreateSession(id, userID, csrfToken, now+24h)` → inserts a row in Postgres.
6. Sets **two cookies**, both `HttpOnly`, `SameSite=Lax`, `Secure` (per
   `WATCH_COOKIE_SECURE`): `watch_session` (the id) and `watch_csrf` (the token).
7. `writeJSON(200, {user})`.

The Go HTTP response carries **two `Set-Cookie` headers** and the user JSON.

### 21. The BFF relays the cookies to the browser
Back in `serverRequest`:
- `res.headers.getSetCookie()` returns the two cookie strings.
- `setResponseHeader("set-cookie", [both])` attaches them to **the server-
  function's response to the browser**. This is the crucial relay: Go set the
  cookies, but they must land on the **`watch.com.ng` origin** (the only origin
  the browser knows). The BFF re-emits them on its own response.
- Returns `{user}`; the `login` server fn wraps it in a `Result`
  (`{ ok: true, data: user }`) so an auth failure (e.g. 401) would survive the RPC
  boundary as data rather than a class-stripped error — see
  [the Result note in auth-model.md](auth-model.md) and `lib/api/result.ts`.

### 22. The browser stores cookies + the form reacts
- The browser receives the RPC response: it stores `watch_session` and
  `watch_csrf` for `watch.com.ng` (both `HttpOnly` — JS can't read them), and the
  JSON body resolves `login()` to `{ ok: true, data: user }`.
- `handleSuccess` ([_auth/login.tsx](../apps/dashboard/src/routes/_auth/login.tsx)):
  `queryClient.setQueryData(["me"], user)` then `navigate({ to: "/" })`.

---

## Act 5 — Client-side navigation to the dashboard (no full reload)

### 23. The guard chain runs on the client this time
`navigate({ to: "/" })` triggers the `beforeLoad` chain **in the browser**:
- Root `beforeLoad`: `ensureQueryData(meQueryOptions())`. `["me"]` is already in
  cache (just set in step 22) and within `staleTime` (5 min), so it returns the
  cached `user` **with no network call**. Returns `{ user }`.
- `_protected` `beforeLoad`: `context.user` is truthy → returns `{ user }` (no
  redirect).
- `_protected/index` renders `DashboardHome`.

### 24. Render
React renders the dashboard component tree on the client. No SSR, no HTML
document — just a client transition. The URL is now `/` and the user sees the
dashboard.

---

## Act 6 — A later data mutation (e.g. creating a project)

This shows the full authenticated path, including **both CSRF layers** and cookie
forwarding. (The screens that call these are future work, but the mechanics are
in place.)

### 25. RPC to the BFF
A component calls `createProject({ data: { name, allowed_origins } })`
([projects.ts](../apps/dashboard/src/lib/api/projects.ts)) — a server-function
`POST` to `watch.com.ng`. The browser **automatically attaches** `watch_session`
and `watch_csrf` (same-origin request). Start's CSRF middleware validates the
browser→Start hop (**layer 1**).

### 26. The BFF forwards to Go with the CSRF header
`serverRequest("POST", "/api/projects", data)`:
- `getRequestHeader("cookie")` → `"watch_session=…; watch_csrf=…"` — forwarded
  verbatim to Go.
- Mutating method → `getCookie("watch_csrf")` → the token → sets
  `X-CSRF-Token: <token>` (**layer 2**, Start→Go).
- `fetch(\`${INTERNAL_API_URL}/api/projects\`, …)`.

### 27. Inside Go: session + CSRF + handler
`/api/` is the protected subtree:
`a.sessionRequired(a.csrfProtected(apiMux))`.
1. `sessionRequired`: reads `watch_session` → `LookupSession` (Postgres, filters
   `expires_at > now()`) → `GetUserByID` → puts session + user in context. Missing
   /expired → 401.
2. `csrfProtected`: method is `POST` (not safe), so it compares the `X-CSRF-Token`
   header to the session row's `CSRFToken`. Match → continue; mismatch → 403. The
   session row is the **source of truth**; the cookie is just how the token
   travels.
3. `handleCreateProject` runs → inserts into Postgres → `writeJSON(201, project)`.

### 28. Back to the browser
`serverRequest` returns the project (no `Set-Cookie` to relay). The server fn
resolves; the UI updates (and any TanStack Query invalidation refetches as wired).
The browser never knew Go existed.

---

## Act 7 — Hard refresh while authenticated (why cookies on the Start origin matter)

### 29. Full document request, now with cookies
The user hits reload. The browser sends `GET watch.com.ng/` and **automatically
includes** `watch_session` + `watch_csrf` (same origin). Full SSR happens again
(Acts 2–3).

### 30. SSR resolves the user this time
- Root `beforeLoad` → `fetchMe` → `serverRequest("GET", "/me")`.
- `getRequestHeader("cookie")` now **has** the cookies → forwarded to Go.
- Go `sessionRequired` validates `watch_session` → `handleMe` returns the user →
  **200**.
- `ensureQueryData` caches the user; root returns `{ user }`.
- `_protected` `beforeLoad`: user present → the **dashboard renders on the server**
  (authenticated first paint, no redirect-to-login flash).

### 31. First post-refresh mutation still works
Even though no JS state survived the reload, the **`watch_csrf` cookie did**. The
next mutation's `serverRequest` reads it via `getCookie` and forwards
`X-CSRF-Token`, so Go's CSRF check passes. (This is the bug the BFF design fixes:
the token lives in a cookie on the Start origin, not in ephemeral JS memory.)

---

## Act 8 — Logout

### 32. Tear down the session
A logout action calls the `logout` server fn → `serverRequest("POST",
"/auth/logout")`:
- Forwards the cookie to Go. `POST /auth/logout` is `sessionRequired` (no CSRF —
  it's idempotent teardown).
- `handleLogout`: `DeleteSession` (Postgres) and sets both cookies to expired
  (`MaxAge: -1`).
- `serverRequest` relays the **clearing** `Set-Cookie` headers to the browser, so
  the browser deletes `watch_session` and `watch_csrf`. Returns 204 → `undefined`.
- The app clears its query cache / navigates to `/login`. The next protected
  navigation's guard finds `user === null` and redirects to `/login`.

---

## Cross-cutting details

### Failure modes
- **Go is down / slow during SSR:** `serverRequest`'s `AbortSignal.timeout(5000)`
  fires a `TimeoutError`; a connection failure throws a `TypeError`. `fetchMe`
  only maps **401** to `null`; other errors propagate, surfacing a router error
  boundary rather than a silent wrong state. (Tunable if you'd rather fail soft to
  `/login`.)
- **Expired session:** `LookupSession` filters on `expires_at > now()`, so an
  expired cookie behaves exactly like an absent one → 401 → redirect to `/login`.
- **Tampered/invalid CSRF on a mutation:** `csrfProtected` returns **403**;
  `serverRequest` throws `ApiError(403)`.
- **Panic in any Go handler:** `recoverer` logs it (with the request id) and
  returns a generic 500 — no stack leaks to the client.

### Observability
Every Go request gets an `X-Request-Id` and one structured access-log line
(method, path, status, bytes, duration, request id) via `requestLogger`. 5xxs are
logged with the underlying error and request id but return a generic message.

### Security properties this flow preserves
- The browser only ever talks to `watch.com.ng`. Go is internal → **no CORS**, and
  the API can be firewalled off the public internet.
- `watch_session` and `watch_csrf` are both `HttpOnly` → unreadable by JS (XSS
  can't exfiltrate them). The BFF reads `watch_csrf` server-side.
- Two CSRF layers: Start's same-origin guard (browser↔Start) and the synchronizer
  token validated against the DB (Start↔Go).
- Passwords are Argon2id with constant-time verification; login errors are vague
  to prevent account enumeration; bodies are size-capped.
- HTTPS end-to-end with `Secure` cookies in production.

### Why server-rendered first, SPA after
The first document is SSR (fast, authenticated first paint, works before JS).
After hydration, navigations are client-side and only data (server-fn RPCs)
crosses the wire. Auth is re-checked on **every** navigation via the root
`beforeLoad`, but reads from the warm `["me"]` cache so it's usually free.

---

## Appendix A — First-run setup (no users exist yet)

1. A fresh deploy has zero users. Visiting `/` → SSR → `/me` 401 → redirect to
   `/login`.
2. The login page links to `/setup`
   ([_auth/setup.tsx](../apps/dashboard/src/routes/_auth/setup.tsx)).
3. `SetupForm` calls the `setup` server fn → `serverRequest("POST",
   "/auth/setup", {email, password})` → Go `handleAuthSetup`.
4. Go: if **any** user already exists → **409** (so setup is safe to hit twice);
   otherwise it hashes the password (Argon2id), gets-or-creates the default org,
   and inserts the first **owner**, returning 201.
5. On success the form navigates to `/login`; the owner signs in (Act 4).

## Appendix B — One-glance sequence (authenticated page load)

```txt
Browser                    Start server (BFF, watch.com.ng)            Go API (internal)          Postgres
   │  GET / (+cookies) ───────────►│                                        │                        │
   │                               │ router match → root beforeLoad         │                        │
   │                               │ ensureQueryData(me) → fetchMe          │                        │
   │                               │ serverRequest GET /me                  │                        │
   │                               │   cookie: watch_session,watch_csrf ───►│ requestID/log/recover  │
   │                               │                                        │ sessionRequired:       │
   │                               │                                        │  LookupSession ───────►│
   │                               │                                        │  GetUserByID  ────────►│
   │                               │◄─────────────────── 200 {user} ────────│                        │
   │                               │ cache ["me"]=user; _protected ok       │                        │
   │                               │ SSR html + dehydrated query + scripts  │                        │
   │◄──── HTML (authenticated) ────│                                        │                        │
   │  parse, theme script, paint   │                                        │                        │
   │  load JS → hydrate → SPA      │                                        │                        │
```
