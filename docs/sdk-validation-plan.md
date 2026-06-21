# Plan: validate the browser SDK end-to-end with full React Router support

## Goal (definition of done)

Generate a **DSN**, drop the Watch SDK into a **React Router** app (any supported
version/mode), trigger errors / Web Vitals / navigations, and watch the events
land in **Postgres** (`raw_events` → worker rollups). Once that loop is proven for
real, build the dashboard screens (M6) against **real data** instead of mocks.

## Why now (grounded in the current repo)

- The SDK is **code-complete but never run in a real app** — there are no example
  apps anywhere, and the unit tests run in jsdom. In particular **Web Vitals have
  never executed** (`PerformanceObserver` doesn't exist in jsdom).
- The dashboard would otherwise be built against a pipeline that's never been
  proven end-to-end. Proving the loop first de-risks M6 and yields real data.
- Server side is ready: ingestion keys, **`/ingest` CORS** (#40), redaction, and
  the rollup worker all exist.

## What works today vs. the gaps

| Capability | Status |
| --- | --- |
| Pathname-level navigation in **any** app | ✅ Core patches `history.pushState/replaceState` + `popstate` ([navigation.ts](../packages/browser/src/navigation.ts)) — works in RR v4–v7, all modes, Next, vanilla |
| Route **template** enrichment (`/users/:id`) | ⚠️ Only `@watch/react/router` via `useMatches` ([router.tsx](../packages/react/src/router.tsx)) → **data & framework mode only** |
| RR **v4 / v5 / v6-declarative** template | ❌ Not supported |
| Pattern reconstruction | ⚠️ Naive string-replace of param values (breaks on repeated/ambiguous values) |
| **Publishability** | ❌ `@watch/browser` depends on `@watch/contracts` via `workspace:*` (can't `npm publish` as-is); no `.changeset` |
| **Real-browser validation** | ❌ None (vitals unproven, SSR-safety unproven) |

## React Router research summary

React Router has three **modes** (additive): **declarative** (`<Routes>`,
`useLocation`, `useNavigate`), **data** (`createBrowserRouter`, loaders,
`useMatches`), **framework** (Remix successor: file-based, SSR). Sources:
[Picking a Mode](https://reactrouter.com/start/modes),
[useMatches](https://reactrouter.com/api/hooks/useMatches),
[v7 modes](https://blog.logrocket.com/react-router-v7-modes/).

How to get **pathname** vs the **route template** per version:

| Version | Package | Pathname | Route template (for grouping) |
| --- | --- | --- | --- |
| v7 | `react-router` | `useLocation` / history | `useMatches` (data & framework mode); **declarative has no template hook** |
| v6.4+ | `react-router-dom` | `useLocation` | `useMatches` (data router only) |
| v6.0–6.3 | `react-router-dom` | `useLocation` | only `useMatch(knownPattern)`; no "current template" hook |
| v5 (5.1+) | `react-router-dom` | `useLocation` | **`useRouteMatch().path`** = template (per route) |
| v4 / v5<5.1 | `react-router-dom` | `withRouter`/render props | **`match.path`** from render props / `withRouter` |

Key limitation (all modern versions): RR **does not expose `route.path`** in
`useMatches` results — only `pathname` + `params`. So the template must be
reconstructed (improve the current util) or read from a route `handle`
([RR discussion #12402](https://github.com/remix-run/react-router/discussions/12402)).

## Design: "React Router as a whole" (+ v4/5/6 back-compat)

Two layers — keep the robust generic layer, add best-effort enrichment:

1. **Pathname everywhere (core, already done).** No version logic; every RR
   version/mode + Next + vanilla gets per-URL navigation + route context. This is
   the floor and it already works.

2. **Route-template enrichment via version-specific adapters** — separate subpath
   exports so each imports only the API its version has, and the matching
   `react-router*` is an **optional peer dependency**:
   - `@watch/react/router` — v6.4+/v7 **data & framework** mode (`useMatches`);
     harden the pattern reconstruction (see below).
   - `@watch/react/router-v5` — **v4 & v5** via `useRouteMatch().path` /
     `withRouter` `match.path` (template is directly available here).
   - **v6 declarative**: no reliable template hook → document the fallback
     (pathname) plus the manual escape hatch.
   - **Manual escape hatch for any version/mode**: `setRoute(pattern)` (exists)
     and a tiny `useWatchRoute(pattern)` hook so an app can annotate its template
     explicitly when no adapter fits.

3. **Harden pattern reconstruction** — replace the naive
   `pathname.replace('/'+value, '/:'+key)` with a segment-aware rebuild (split
   pathname and params by segment; only substitute whole segments; handle splats),
   with unit tests for repeated values, numeric ids, nested routes.

## Packaging / publish-readiness

- **Resolve the `@watch/contracts` workspace dep.** Recommended: bundle contracts
  into the SDK `dist` (tsup `noExternal: [/@watch\/contracts/]`) so the published
  package has no `workspace:*` dep. (Contracts is internal shared types — bundling
  is simplest. Alternative: publish `@watch/contracts` too.)
- **Verify the tarball** with `npm pack`: correct `files`, working `exports`
  (`.`, `./router`, `./router-v5`), types resolve, no `workspace:` deps leak.
- **Init changesets** (`.changeset/`), keep versions at `0.0.0` until the first
  real release.
- **Prove install locally before public npm**: install the tarball (or a Verdaccio
  local registry) into a scratch app. **Do not publish to public npm until the
  loop is proven** — publishing is a near-one-way door.

## DSN generation

- A **DSN** is `${WATCH_HOST}/ingest/${public_key}` (see `init` in
  [index.ts](../packages/browser/src/index.ts)).
- Minting today: `POST /api/projects` (authenticated + CSRF) returns the project
  with its environment and **`public_key`**; the project's `allowed_origins` must
  include the example app's origin (e.g. `http://localhost:5173`) so `/ingest`
  CORS + origin checks pass.
- For this phase, provide a **small mint helper** (a script or documented `curl`
  flow) that logs in, creates a project with the right origins, and prints the
  ready-to-paste DSN. (A proper "API keys" dashboard screen lands with M6.)

## Example apps + the end-to-end loop

Under `examples/` (new workspace dir), each app: `watch.init({ dsn })`, a
"throw error" button, something that emits Web Vitals, client navigations, plus
`WatchErrorBoundary` + the matching router adapter.

1. **`examples/react-router-v7`** (data or framework mode) — prove the full loop
   first: example app → `/ingest` → `raw_events` → worker rollups → verify in
   Postgres. A **Playwright** smoke test in a real browser proves vitals actually
   fire. **This unblocks the dashboard with real data.**
2. **`examples/react-router-v5`** — exercise the v5 adapter (`react-router-dom` v5).
3. **`examples/nextjs`** — the **SSR/RSC stress test**: confirm the SDK is
   server-safe (`typeof window` guards, `'use client'` boundaries) and works in
   App Router. Highest-value correctness check.

## Sequencing (one focused PR each, off up-to-date `main`)

1. `feat/sdk-packaging` — bundle contracts, changesets, `npm pack` verified.
2. `feat/sdk-rr-versions` — router adapters (`/router`, `/router-v5`), hardened
   pattern util, `useWatchRoute`, tests.
3. `feat/dsn-mint` — mint script/docs (can fold into the example PR).
4. `feat/example-rr7` — RR v7 example + end-to-end loop + Playwright vitals proof.
5. `feat/example-rr5`, `feat/example-next` — v5 adapter + Next SSR-safety.
6. **Then** dashboard screens (M6) against the real data now flowing.

## Validation checklist (the "I can see data" proof)

- [ ] `npm pack` tarball installs cleanly into a scratch app (types + exports work).
- [ ] DSN minted; example app's `init` accepts it.
- [ ] Triggering an error/vital/navigation produces rows in `raw_events`.
- [ ] The worker turns them into `error_rollups` / `vital_rollups`.
- [ ] Route context shows **templates** (`/users/:id`), not raw URLs, per version.
- [ ] Web Vitals captured in a **real browser** (Playwright), not just jsdom.
- [ ] Next.js build/SSR doesn't crash on server-side `window`/`document`.

## Decisions (locked)

1. **React Router support:** full template support for **v6.4+/v7** (data &
   framework) + a **v5 adapter**. v6-declarative → pathname fallback + manual
   `setRoute`/`useWatchRoute`. **v4 is best-effort/manual only** (no dedicated
   adapter or example).
2. **DSN minting:** a **mint script / `curl` flow** for this phase; the "API keys"
   dashboard screen lands with M6.
3. **Publish timing:** prove the loop via `pnpm pack` tarball / Verdaccio; **defer
   public npm** until validated.
