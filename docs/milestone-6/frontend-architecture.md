# Milestone 6 Frontend Architecture

This note explains how the Watch dashboard should use TanStack Start and the
TanStack ecosystem, with special attention to mobile responsiveness. It is a
companion to [README.md](README.md), which defines the milestone scope and task
breakdown.

The guidance here was checked against the official TanStack docs on
2026-06-18:

- [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Router overview](https://tanstack.com/router/latest/docs/overview)
- [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Table overview](https://tanstack.com/table/latest/docs/overview)
- [TanStack Form quick start](https://tanstack.com/form/latest/docs/framework/react/quick-start)
- [TanStack DB overview](https://tanstack.com/db/latest/docs/overview)

## Source Status: Official Docs vs Watch Decisions

Not every sentence in this file is a direct quote or rule from TanStack docs.
The right way to read this note is:

| Topic | Source status |
|-------|---------------|
| TanStack Start being a full-stack React framework powered by TanStack Router, with SSR, streaming, server functions, client/server builds, and Vite/Rsbuild support | Directly from official TanStack Start docs. |
| TanStack Start currently being release-candidate software | Directly from official TanStack Start docs. Re-check before every setup PR. |
| TanStack Router supporting nested routing, search params, and data loading | Directly from official TanStack Start/Router docs. |
| TanStack Query being for fetching, caching, synchronizing, and updating server state | Directly from official TanStack Query docs. |
| TanStack Table being headless and requiring the app to provide markup and styles | Directly from official TanStack Table docs. |
| TanStack Form focusing on type safety, performance, composition, and production-scale forms | Directly from official TanStack Form docs. |
| TanStack DB providing normalized collections, live queries, query-driven sync, and optimistic mutations | Directly from official TanStack DB docs. |
| The hybrid SSR/public shell plus client-heavy protected dashboard strategy | Watch-specific architecture recommendation based on the docs and this product's authenticated dashboard shape. |
| Same-origin production deployment preference | Watch-specific deployment recommendation based on cookies, CSRF, and self-hosting simplicity. |
| Query key names, route list, stale-time guidance, and invalidation rules | Watch-specific conventions for this API surface. |
| Mobile table/card behavior, touch-target rules, and no-horizontal-overflow gates | Watch-specific UX quality requirements. |
| Deferring TanStack DB | Watch-specific product decision. The docs explain what DB is good at; the decision is that M6 does not yet have those needs. |

So: yes, the library capability claims are grounded in official docs. The
architecture choices are deliberately mine/ours, made from those docs plus the
Watch domain, the Go server boundary, the current API, and the requirement for a
mobile-usable production dashboard.

## 1. Rendering Strategy

Use TanStack Start as a full-stack-capable React framework, but build the
protected dashboard as a mostly client-interactive application over the Go
Dashboard API.

Recommended model:

```txt
TanStack Start
  |
  +-- SSR document, root layout, public auth routes, app shell chrome
  |
  +-- Client-side protected dashboard
      |
      +-- TanStack Query reads and mutates the Go Dashboard API
      +-- TanStack Router owns route/search-param state
      +-- TanStack Form owns complex form state
```

Do not build M6 as a plain Vite SPA because Start gives us useful routing,
document rendering, nested layouts, future deployment flexibility, and a cleaner
path to server-side helpers if we need them later.

Do not move Watch product API behavior into TanStack Start. The Go server is the
source of truth for auth, CSRF, projects, ingestion keys, issues, rollups,
retention, privacy rules, and future alert/release behavior. TanStack Start may
host the dashboard and eventually provide thin server-side glue, but it should
not become a second backend.

## 2. SPA vs SSR Decision

The dashboard does not need SEO-driven page rendering. It is an authenticated
operational app. The best fit is a hybrid:

- **SSR/static-friendly public routes**: setup, login, basic document shell,
  metadata, and error boundaries.
- **Client-heavy protected routes**: overview, projects, issues, Web Vitals,
  settings, and future alerts.
- **Route-level code splitting**: keep first load small, especially on mobile.
- **Client-side data fetching with TanStack Query**: authenticated reads depend
  on the Go session cookie and current project/environment context.
- **Progressive enhancement for refresh**: after reload, call `GET /me`, restore
  selected project/environment, then render protected routes.

This keeps the dashboard fast and flexible without adding a server-rendered data
loading dependency for every authenticated table and chart.

## 3. Deployment Shape

There are two viable deployment shapes. M6 should design so either remains
possible, but implementation should start simple.

### Preferred v1 shape: same-origin dashboard

```txt
https://watch.example.com/
  |
  +-- Dashboard app assets/pages
  +-- /auth/* and /api/* served by Go Dashboard API
  +-- /ingest/* served by Go Ingestion API
```

Benefits:

- Session cookies are simple.
- CSRF behavior is simpler.
- No production CORS policy for dashboard API calls.
- Self-hosting story is easier.

### Development shape: two local processes

```txt
localhost:3000  -> TanStack Start dev server
localhost:8080  -> Go server
```

In development, use a clear API base URL or proxy strategy. The API client must
make the boundary obvious and tests must cover both relative and configured base
URL behavior if both are supported.

### Development API configuration

In the two-process local dev setup, the TanStack Start / Vite dev server runs
on `localhost:3000` and the Go server on `localhost:8080`. The dashboard API
client must know where to send requests.

Recommended approach:

- Default to relative URLs (`/auth/...`, `/api/...`, `/me`) for production.
- Support a `VITE_API_BASE_URL` environment variable for local dev. When set,
  prepend it to every request in the base `client.ts` helper.
- Use a Vite dev server proxy as an alternative to a base URL env var: proxy
  `/auth`, `/api`, `/me`, `/ingest`, and `/health` to `localhost:8080` in
  `vite.config.ts`. This keeps the dashboard code free of any env var branch
  and best simulates same-origin production behavior.
- Do not hardcode `localhost:8080` anywhere in application code. Put all API
  origin config in one place (`vite.config.ts` proxy or a single `client.ts`
  constant derived from the env var).

The proxy approach is preferred because:

- No code branch between dev and prod — relative URLs always work.
- Cookie and CSRF behavior is identical to production same-origin serving.
- No accidental leakage of a hardcoded dev URL into the production build.

Add a note in the dashboard README or `.env.example` explaining how to start
the Go server, the database, and the dashboard dev server for local development.

## 4. TanStack Router Strategy

Use routes to model product workflows, not implementation folders.

Recommended route groups:

```txt
/
/setup
/login
/app
/app/projects
/app/projects/$projectId/overview
/app/projects/$projectId/issues
/app/issues/$issueId
/app/projects/$projectId/vitals
/app/settings
```

Search params should carry shareable UI state:

- `environment_id`
- `from`
- `to`
- `metric`
- `status`
- `limit`
- `offset`

Do not hide important operational filters only in component state. A developer
should be able to copy a URL to the same project, environment, time range, and
issue status filter.

Use nested layouts:

- Root layout: document, providers, global error boundary.
- Auth layout: setup/login card and minimal page shell.
- App layout: sidebar/mobile navigation, project/environment selector, account
  controls, content outlet.
- Project layout: tabs or secondary navigation for overview, issues, Web Vitals,
  and future project-level screens.

## 5. TanStack Query Strategy

Use TanStack Query for all Dashboard API server state.

Query key conventions:

```ts
["me"]
["projects"]
["issues", projectId, environmentId, { status, limit, offset }]
["issue", issueId]
["rollups", "errors", projectId, environmentId, { from, to }]
["rollups", "vitals", projectId, environmentId, metric, { from, to }]
```

Mutation conventions:

- Project/environment/key mutations invalidate `["projects"]`.
- Issue status mutations invalidate `["issues", ...]` and `["issue", issueId]`.
- Login invalidates `["me"]` and stores the CSRF token in the auth client.
- Logout clears the Query cache and local selected project/environment state.

Use optimistic updates sparingly in M6:

- Good candidate: issue status changes.
- Avoid initially: key revocation and project creation, because the returned
  server shape matters and errors need clear handling.

Default freshness:

- `GET /me`: refetch on mount and window focus.
- Projects: moderately fresh; refetch on focus.
- Issues: short stale time; issue lists should feel live enough after worker
  updates.
- Rollups: short-to-moderate stale time; allow manual refresh.

## 6. TanStack Table Strategy

Use TanStack Table for issue lists and any future dense tabular data. It is
headless, so Watch owns the markup, accessibility, responsive behavior, and
visual design.

Desktop table behavior:

- Server-backed pagination using `limit` and `offset`.
- Status filtering through URL search params.
- Stable columns: status, title, route, release, count, last seen, actions.
- Row action menu for resolve, ignore, reopen, and future copy/share actions.

Mobile table behavior:

- Do not squeeze full desktop tables into 360 px.
- Use responsive column visibility: show title, status, count, and last seen.
- Move secondary fields into expandable row details or a detail sheet.
- Keep row actions reachable through an icon button with an accessible label.
- Preserve pagination controls, but use larger touch targets and shorter labels.

Tables must have Storybook stories for:

- empty data
- loading skeleton
- error state
- long titles/routes
- many rows
- mobile viewport
- keyboard focus and row actions

## 7. TanStack Form Strategy

Use TanStack Form for forms with meaningful validation or multi-field behavior:

- setup owner
- login
- create project
- allowed origins
- create environment
- time-range controls if they become complex
- future alert rules/settings

Keep simple one-click mutations, such as "create key" or "revoke key", outside
forms unless they gain confirmation fields.

Validation should happen in three layers:

- Client: required fields, URL/origin shape, password minimums, obvious typos.
- API client: typed request/response parsing and normalized errors.
- Server: authoritative validation and permission checks.

Client validation improves UX but must never replace server validation.

## 8. TanStack DB Decision

Do not add TanStack DB in the first M6 implementation.

TanStack DB is promising for reactive local collections, live queries,
normalized data, optimistic mutations, and query-driven sync. The docs describe
it as extending TanStack Query with collections, live queries, and optimistic
mutations, with sync modes such as eager, on-demand, and progressive loading.

Watch does not need that complexity yet because M6 reads relatively small,
server-shaped resources:

- current user
- projects/environments/keys
- issues with pagination
- issue detail
- error rollups
- vital rollups

Use TanStack Query first. Reconsider TanStack DB later if one of these becomes
true:

- The dashboard needs cross-resource client-side joins across large collections.
- Offline-first dashboard behavior becomes a requirement.
- Realtime sync or local optimistic collections become central to UX.
- Endpoint sprawl appears because many screens need different projections of
  the same normalized data.
- Client-side filtering/sorting across tens of thousands of records becomes
  necessary.

This is a "not yet", not a rejection.

## 9. Chart Strategy

Use Recharts exposed through Watch-owned chart wrapper components following the
shadcn chart pattern. Do not call Recharts APIs directly from feature components
— wrap it behind small local chart primitives so the library can be upgraded or
replaced without touching multiple screens.

Chart architecture rules:

- Lazy-import chart wrapper components at the route level. Auth routes (login,
  setup) must not include Recharts code in their bundle.
- Give every chart a fixed height. Charts must not size themselves from data
  shape or number of buckets.
- Server-backed rollup data is the only data source for M6 charts. Do not
  compute, aggregate, or transform raw event arrays client-side.
- Provide a loading skeleton that fills the same visual space as the chart so
  no layout shift occurs.
- Provide a clear error state with a retry action inside the chart boundary.
- Provide an empty state for zero-bucket responses (no events in this time
  window) that answers "why is this blank?" and, where appropriate, points the
  user to the next action.
- Axes, tick labels, and tooltips must use human-readable formatted values
  (seconds, milliseconds, counts, percentages). Raw floats must not appear in
  the UI.
- Use design-system chart color tokens, not inline hex values.
- Let chart width follow its container using `width="100%"`. Height is fixed.
- Legends must not rely on color alone: include labels, dashes, or shapes so
  colorblind users can distinguish series.

M6 chart surfaces:

- Line or area chart for error rollup over time (ErrorRollup buckets:
  period_start + error_count).
- Line or bar chart for vital rollup over time (VitalRollup buckets:
  period_start + p75 + mean + health_score).
- Small metric summary numbers (p75, mean, sample_count, health_score) next
  to or below the chart, not embedded inside it.
- Health score: use design-system status color tokens (good / needs-improvement
  / poor) so visual threshold status is consistent with issue status colors.

Storybook stories for charts must cover:

- loading skeleton
- empty data (no buckets)
- error state with retry
- realistic data at phone, tablet, and desktop widths
- colorblind-safe legend legibility

Defer for M6+:

- Reference lines for Google threshold boundaries on vital charts.
- Multiple metric overlay on a single chart.
- Chart zoom, pan, or brush selection.
- Custom tooltip formatters beyond Recharts defaults.

## 10. API Client Architecture

The `src/lib/api/` module is the single boundary between dashboard UI and the
Go server. No UI component, query hook, or mutation hook should call `fetch`
or handle raw HTTP status codes directly.

Proposed module structure:

```txt
lib/api/
  client.ts     — base request helper, credentials, CSRF header, error mapping
  auth.ts       — setup, login, logout, me
  projects.ts   — list, create project, create environment, mint key, revoke key
  issues.ts     — list issues, get issue, update status
  rollups.ts    — get error rollups, get vital rollups
  types.ts      — shared TypeScript request and response types
  errors.ts     — local error classes (ApiError, AuthError, ValidationError, etc.)
```

CSRF handling:

- After login, store the CSRF token in a module-level variable in `client.ts`.
  Do not use localStorage or sessionStorage unless a deliberate decision is made
  with the tradeoffs documented.
- The base request helper automatically attaches `X-CSRF-Token` to all non-GET
  requests. Feature code must not manually manage this header.
- On logout or on receiving a `401`, clear the stored token.

Error normalization:

- Map HTTP status codes to a local error type hierarchy:
  - `401` → `AuthError` (triggers redirect to login via global query observer)
  - `403` → `ForbiddenError` (show inline, no redirect)
  - `409` → `ConflictError` (used by setup screen)
  - `400` / `422` → `ValidationError` carrying the server `{"error":"..."}` message
  - `5xx` → `ServerError`
- Never expose raw status codes or `response.ok` conditionals to form or table
  components. Every failed response becomes a typed local error.

Request helper conventions:

- Always set `credentials: "include"` so the `HttpOnly` session cookie attaches.
- Accept an `AbortSignal` on any request a component might unmount before
  completion (list queries, detail fetches).
- Set `Content-Type: application/json` on mutation requests.
- If the server returns an unexpected shape, throw `ServerError`, not a silent
  `undefined` or partial object.

Testing:

- Unit test error normalization and CSRF attachment without hitting a real server.
- MSW handlers in `src/mocks/` must mirror real Go server response shapes,
  including error bodies, so tests cover the same contract the server enforces.

## 11. Selected Project and Environment State

The selected project and environment are the most important shared client state
in the dashboard. Issue and rollup endpoints both require `environment_id`, so
every data screen depends on having a resolved selection.

Decision: reflect selected project and environment in the URL, not only in
React context or a client-side store.

Reasoning:

- URL-based selection means the browser back button works as expected.
- A developer can share a URL and the recipient sees the same project/environment
  context.
- TanStack Router already owns the URL; adding a parallel state store for the
  same information creates two sources of truth.

Implementation:

- Use `$projectId` as a dynamic route segment for project-scoped routes:
  `/app/projects/$projectId/overview`, `/app/projects/$projectId/issues`, etc.
- Use `environment_id` as a search parameter on screens that need it.
- The project/environment selector in the app shell navigates to the appropriate
  route rather than writing to a context. The selector reads its current values
  from the route params and search params, not from separate state.
- On hard reload, the URL is authoritative. The shell fetches the project list
  and resolves display names from the `projectId` in the URL.

Default selection when `environment_id` is missing:

- If navigating to a project route without `environment_id` in the search params,
  default to the first environment in the project's environment list.
- If the project has no environments, show the onboarding prompt to create one
  rather than rendering empty charts.

Implications for TanStack Query:

- Since `projectId` and `environmentId` come from the URL, query keys such as
  `["issues", projectId, environmentId, ...]` become stable when the route is
  stable and naturally invalidate when the user switches projects or environments.
  This removes the need to manually track "did the user change the selection."

What NOT to do in M6:

- Do not persist `environment_id` to localStorage in M6. If sticky
  cross-session selection becomes a product requirement, make it a deliberate
  decision with documented tradeoffs around stale context after key revocation.
- Do not duplicate selected project/environment in React context AND the URL.
  Pick one — the URL.

## 12. Mobile Responsiveness Strategy

The dashboard must be usable on any modern phone, not merely non-broken. Treat
mobile as a primary operating mode for triage and inspection.

Minimum target:

- 320 px width support for older small phones.
- 360-390 px optimized layout for common phones.
- 768 px tablet layout.
- Desktop layout from 1024 px upward.
- Safe-area support for devices with notches and home indicators.
- Touch targets at least 44 px where practical.
- No horizontal page scrolling except inside intentional chart/table regions.

Navigation:

- Desktop: sidebar or compact rail with project/environment controls visible.
- Tablet: collapsible sidebar.
- Phone: top project/environment switcher plus bottom navigation or menu sheet.
- Account/logout and settings should remain reachable without hiding critical
  project context.

Content patterns:

- Metric cards become a 1-column stack on phones, 2-column on larger phones,
  and denser grids on tablets/desktops.
- Tables become cards, condensed rows, or row-detail sheets.
- Charts keep fixed responsive heights and readable axes; avoid tiny labels.
- Filters move into a compact toolbar or bottom sheet on phone.
- Copyable DSNs use wrapping code blocks and a clear copy button.
- Dialogs that would be cramped on mobile should become sheets or full-screen
  flows.

State patterns:

- Loading states must reserve space so the layout does not jump.
- Empty states must fit in the content flow, not consume an entire mobile screen
  unless they are the whole workflow.
- Error states must include retry actions with touch-friendly controls.
- Long project names, routes, error titles, and releases must truncate or wrap
  intentionally.

## 13. Mobile Testing Requirements

Every major screen must be checked at phone, tablet, and desktop sizes.

Storybook:

- Add viewport stories for phone, tablet, and desktop.
- Include mobile stories for app shell, onboarding, issue list, issue detail,
  overview charts, Web Vitals charts, and empty/error states.

Playwright:

- Add mobile projects for at least one small phone and one modern phone.
- Cover setup/login, project onboarding, issue list/detail, and logout on mobile.
- Include a "no horizontal overflow" assertion on core routes.
- Include keyboard/focus tests for desktop and touch-oriented tests for mobile.

Manual review:

- Navigate all primary workflows with one hand on a phone-sized viewport.
- Confirm controls are not too small or too close together.
- Confirm route filters and selected project/environment are visible or easily
  recoverable.
- Confirm charts and tables remain understandable without desktop hover.

## 14. Things We Might Be Missing

These are not all M6 requirements, but they are planning gaps worth making
visible now. Each item names the decision needed, the risk if ignored, and the
suggested M6 posture.

### API response contracts

Decision needed: Should dashboard response shapes live only in
`apps/dashboard/src/lib/api`, or should they move into `packages/contracts`?

Risk if ignored: The browser SDK, dashboard, and server can drift into separate
definitions of Watch domain objects.

M6 posture: Start with local API-client types while the UI is young. Promote to
`packages/contracts` when at least two packages need the same dashboard response
shape or when a shape becomes a long-lived public contract.

### CSRF refresh

Decision needed: How does the dashboard recover its CSRF token after a full page
refresh if the session cookie is still valid?

Risk if ignored: A user can refresh a logged-in dashboard and see reads work but
mutations fail because the in-memory CSRF token is gone.

M6 posture: Keep the token in memory initially, but plan a server route such as
`GET /session` or an expanded `GET /me` response if refresh persistence becomes
necessary. Do not put the CSRF token in localStorage unless we consciously accept
that tradeoff.

### Same-origin serving

Decision needed: In production, does the Go server serve the built dashboard
assets, or does a reverse proxy route `/` to the dashboard runtime and `/api`,
`/auth`, `/ingest` to Go?

Risk if ignored: Cookie, CSRF, CORS, and deployment docs get messy right when
the product should become easy to self-host.

M6 posture: Design all dashboard API calls to work with same-origin relative
URLs by default. Support a development API base URL for local two-process work.

### Route-level permissions

Decision needed: Which dashboard actions require `owner`, `admin`, `member`, or
`viewer`?

Risk if ignored: The UI may expose actions that the server later denies, or the
server may allow mutations that roles should prevent.

M6 posture: Keep M6 focused on one owner account and first-product usability.
Document future role gates near each mutating action as the UI is built.

### Session expiry UX

Decision needed: What happens when the session expires while the user is on an
issues screen or halfway through a form?

Risk if ignored: Expired sessions feel like random API errors.

M6 posture: Normalize `401` responses in the API client, clear auth state, keep
the intended return URL, and show login with a concise expired-session message.

### System health read model

Decision needed: What data powers the dashboard system-health screen beyond
`GET /health`?

Risk if ignored: The dashboard can only say the API is up, not whether ingestion,
workers, drops, database, retention, or alerts are healthy.

M6 posture: Do not promise a full system-health screen until the server exposes
a real read model. Add this as a future endpoint/task.

### Network and asset rollups

Decision needed: What server endpoints should power network failures, asset
failures, and chunk failure screens?

Risk if ignored: The frontend may design screens that cannot be backed by the
current M5 API, or it may query raw events directly.

M6 posture: Keep dedicated network/asset screens out of M6. Let M6 prove error
and Web Vital dashboards first, then add server read models for these signals.

### Realtime updates

Decision needed: Is polling enough, or do issue/rollup/alert views need
WebSockets or Server-Sent Events?

Risk if ignored: The dashboard may either feel stale during incidents or become
over-engineered early.

M6 posture: Use TanStack Query polling/refetch controls first. Reconsider
SSE/WebSockets for alerts or live incident mode.

### Timezone policy

Decision needed: Are chart buckets displayed in UTC, browser local time, or a
deployment-configured timezone?

Risk if ignored: Operators may misread incident timing, especially around
deploys, daylight saving changes, or distributed teams.

M6 posture: Store and query times in UTC. Display a clear label in the UI. Use
browser local time for readability only if labels make that explicit.

### Internationalization

Decision needed: Is v1 English-only, and if so, what coding patterns keep future
i18n possible?

Risk if ignored: Text, layout, and formatting assumptions can make later
translation expensive.

M6 posture: English-only for v1, but avoid hard-coded width assumptions, string
concatenation for sentences, and locale-hostile date/number formatting.

### Privacy and retention visibility

Decision needed: Where does the dashboard show what Watch collects, redacts, and
retains?

Risk if ignored: The privacy-first promise exists in docs/tests but is invisible
to operators.

M6 posture: Add at least small settings/read-only surfaces later for retention,
allowed origins, and privacy defaults. Do not make M6 settings pretend to be
complete before the server supports them.

### Performance budgets

Decision needed: What are acceptable route-load, bundle-size, and interaction
budgets for the dashboard?

Risk if ignored: Storybook, charts, tables, and UI primitives can quietly bloat
the mobile experience.

M6 posture: Once the scaffold exists, add a lightweight budget: route-level code
splitting, lazy chart imports if needed, no unnecessary chart/table code on auth
routes, and mobile performance checks in Playwright or Lighthouse later.

### Error boundary reporting and dogfooding

Decision needed: Should the Watch dashboard report its own frontend errors to
Watch?

Risk if ignored: Dogfooding can create recursion or pollute demo data if not
isolated.

M6 posture: Do not dogfood automatically in the first dashboard scaffold. Add it
later behind explicit configuration and a separate project/environment.

### Offline and poor-network behavior

Decision needed: What should the dashboard do when the operator has a weak
mobile connection?

Risk if ignored: Mobile triage fails in exactly the kind of degraded situation
where someone may be checking an incident away from a desk.

M6 posture: Use Query's loading/error/retry states intentionally, keep cached
data visible when refetching, and make retry controls obvious.

### Browser and device support

Decision needed: Which browsers and device sizes are release gates?

Risk if ignored: "Mobile responsive" becomes subjective and regressions slip in.

M6 posture: Test Chromium desktop, one WebKit mobile-like project, one small
phone viewport, one common phone viewport, one tablet viewport, and desktop.

### Data density vs readability

Decision needed: How much information belongs on mobile issue/overview screens?

Risk if ignored: Mobile becomes either unusably cramped or too shallow to be
useful.

M6 posture: Prioritize triage fields on mobile: status, title, count, last seen,
route, and primary action. Push secondary details into sheets/details.

### Search and command navigation

Decision needed: Should the dashboard have project/issue search or a command
menu?

Risk if ignored: It may be hard to move quickly once projects/issues grow.

M6 posture: Not required for first M6, but route and API designs should not make
it hard to add later.

### Audit trail for mutations

Decision needed: Should issue status changes and key revocations record who did
what and when?

Risk if ignored: Operational actions become hard to explain in production.

M6 posture: UI can show actions now, but the real audit trail needs server
support. Capture as a later backend/dashboard task.

### Destructive-action confirmation

Decision needed: Which actions need confirmation or undo?

Risk if ignored: Mobile taps can accidentally revoke keys or change issue state.

M6 posture: Require confirmation for key revocation. Issue status changes can be
direct but should be visible and reversible (`resolved`/`ignored` -> `open`).

### Toast and mutation feedback

Decision needed: How are mutation outcomes (success, failure, partial success)
communicated to the user across forms, table row actions, and shell controls?

Risk if ignored: Buttons and forms silently succeed or fail, or different
screens invent different feedback patterns that drift over time.

M6 posture: Mount a single toast/notification provider (the shadcn Sonner
component) in the root layout. Mutation hooks surface outcomes through the
toast so feedback is consistent across all screens. Avoid duplicating both
inline success messages AND toasts for the same mutation.

### Dark mode readiness

Decision needed: Will the dashboard ship a dark mode, and if not, does the
initial token and component work leave the door open?

Risk if ignored: If color tokens are hardcoded to light values from the start,
retrofitting dark mode later requires touching every component.

M6 posture: Do not ship a dark mode toggle in M6. However, use Tailwind's
`dark:` variants for design-system tokens from the beginning so a future dark
mode pass is additive, not a rewrite. shadcn/ui provides dark-mode-ready
component variants out of the box.

### Route loader error handling

Decision needed: TanStack Start supports route loaders that can fail. How are
loader errors surfaced in the nested route tree without breaking the whole shell?

Risk if ignored: A failed loader on a sub-route crashes the page silently, or
the wrong layer of the layout tree becomes the error boundary.

M6 posture: Use TanStack Router's `errorComponent` option at the route level
for recoverable route-data failures. Preserve the app shell when only a
sub-route's data fails. Reserve a root-level error boundary for genuinely
unrecoverable errors (provider failures, total API outage). Keep error
components consistent with the design system's error state pattern.

### Code splitting for heavy dependencies

Decision needed: Recharts and TanStack Table add meaningful bundle weight. How
is that weight kept off of auth routes and the initial load?

Risk if ignored: The login/setup screens load chart and table code unnecessarily,
slowing first paint on mobile.

M6 posture: Lazy-import chart wrapper components and the TanStack Table-backed
issue table at the route level using dynamic imports. TanStack Start and Vite
create chunk boundaries automatically. Auth routes (setup, login) should contain
no chart or table library code. Measure bundle sizes after scaffold and after
each heavy dependency is added to catch regressions early.

### Typography and font loading

Decision needed: Which typeface, size scale, and font loading strategy does the
dashboard use?

Risk if ignored: Font loading can block paint on mobile or cause layout shift if
weights are not declared upfront. A web font added late requires retrofitting
`font-display`, preload hints, and fallback metrics.

M6 posture: Use a system font stack for M6 to eliminate font loading complexity
entirely. Define the full typographic scale (page title, section heading, table
text, metric number, label, helper text, code/DSN text) in design system tokens
before building product screens. If a custom typeface is introduced later,
require `font-display: swap`, preloaded weights, and a size-adjusted fallback.

## 15. Architecture Decision

For M6, build:

- TanStack Start with Vite.
- Hybrid rendering: SSR/public shell plus client-heavy protected dashboard.
- Go server remains the product API and source of truth.
- TanStack Router owns route hierarchy and URL state.
- TanStack Query owns Dashboard API server state.
- TanStack Table powers dense issue/project tables through Watch-owned markup.
- TanStack Form powers meaningful forms.
- TanStack DB is deferred until client-side normalized collections or realtime
  optimistic workflows become a proven need.
- Recharts wrapped through Watch-owned chart components following the shadcn
  chart pattern. Feature code never calls Recharts APIs directly.
- Mobile responsiveness is a release gate, not a polish pass.
