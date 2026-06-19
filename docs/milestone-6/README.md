# Milestone 6: Dashboard

A learning reference for M6 of Watch. M1 built the server-side ingestion and
dashboard APIs, M2-M3 built the browser SDK, M4 added React integrations, and
M5 added the worker, issues, and rollups. M6 turns those backend capabilities
into the first usable product surface: the TanStack Start dashboard.

For broader context see [docs/roadmap.md](../roadmap.md),
[docs/architecture.md](../architecture.md), and
[docs/how-watch-works.md](../how-watch-works.md). The dashboard app lives in
`apps/dashboard/`.

For the TanStack Start rendering strategy, TanStack Query/Table/Form usage,
mobile responsiveness plan, and TanStack DB decision, see
[frontend-architecture.md](frontend-architecture.md).

The implementation plan in this document was checked against the current
official docs on 2026-06-18:

- [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview)
  and [getting started](https://tanstack.com/start/latest/docs/framework/react/getting-started)
- [TanStack Start build from scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)
- [TanStack Router overview](https://tanstack.com/router/latest/docs/overview)
- [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form quick start](https://tanstack.com/form/latest/docs/framework/react/quick-start)
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite),
  [Data Table](https://ui.shadcn.com/docs/components/data-table), and
  [Chart](https://ui.shadcn.com/docs/components/chart)
- [Storybook install](https://storybook.js.org/docs/get-started/install),
  [UI testing](https://storybook.js.org/docs/writing-tests),
  [accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing),
  and [visual testing](https://storybook.js.org/docs/writing-tests/visual-testing)
- [Vitest getting started](https://vitest.dev/guide/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [MSW introduction](https://mswjs.io/docs/)
- [Playwright installation](https://playwright.dev/docs/intro)
- [W3C WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/)

Before each implementation PR that adds or configures a dependency, re-check
the relevant official docs and changelogs. TanStack Start is currently
documented as a release candidate, so the scaffold and build details should
follow upstream docs at the moment the PR is created.

## 2. Vocabulary

- **Dashboard API** - the authenticated HTTP API served by `apps/server`. The
  dashboard talks to this API for login state, projects, keys, issues, and
  rollups. It never talks to the public ingestion endpoint except when showing
  a generated DSN to users.
- **TanStack Start** - the React application framework planned for the Watch
  dashboard. It provides file-based routing, server functions, loaders, and the
  build/dev entry point for `apps/dashboard`.
- **TanStack Router** - the route system underneath TanStack Start. Its value
  here is type-safe navigation, nested layouts, route loaders, typed search
  params, and URL state for filters.
- **TanStack Query** - client-side server-state cache for Dashboard API reads
  and mutations. The dashboard reads remote data owned by the Go server; Query
  handles caching, revalidation, pagination, and mutation invalidation.
- **TanStack Form** - type-safe form state and validation wiring for setup,
  login, project, environment, key, and filter forms.
- **shadcn/ui** - copied-in UI component source built on Tailwind CSS and
  headless primitives. The components become Watch-owned code once added, which
  means we can adapt them to the dashboard without carrying a large opaque UI
  framework.
- **Storybook** - the component workshop and visual documentation surface. It
  should hold stories for primitive UI, composed widgets, empty/error/loading
  states, and dashboard screen slices.
- **MSW** - Mock Service Worker. A single API mock layer used by component
  tests, Storybook stories, and selected E2E scenarios so frontend states do not
  drift between tools.
- **Playwright** - browser automation for end-to-end tests. It verifies real
  routing, auth, forms, keyboard behavior, API calls, and smoke workflows in
  Chromium, Firefox, and WebKit where practical.
- **Accessibility test** - an automated check for common WCAG failures plus
  manual keyboard and screen-reader-minded review. Automated tools do not prove
  accessibility, but they catch important regressions early.
- **Visual regression test** - a screenshot-based comparison of component or
  page states. Use it to protect high-value UI surfaces from accidental layout,
  spacing, typography, and color regressions.
- **App shell** - the persistent dashboard frame: navigation, project selector,
  environment selector, account/logout controls, and the content outlet for the
  current screen.
- **Protected route** - a dashboard route that requires an authenticated
  session. If `GET /me` fails, the app redirects to login instead of rendering
  stale or unauthenticated data.
- **CSRF token** - a per-session token returned by `POST /auth/login`. Mutating
  `/api/*` requests must send it back so a third-party site cannot make a
  logged-in browser mutate Watch state.
- **Project onboarding** - the first workflow after login: create a project,
  create an environment, mint an ingestion key, and copy the SDK DSN.
- **Selected project context** - the project and environment currently driving
  dashboard reads. Issue and rollup endpoints require both IDs, so the UI needs
  one obvious selected context.
- **Rollup chart** - a visualization backed by pre-aggregated rows from M5, not
  raw events. M6 displays these rows; it does not compute metrics client-side
  from `raw_events`.
- **Empty state** - a useful state for a real deployment with no projects,
  no environments, no keys, no issues, or no recent events. Empty states should
  create the next sensible action, not explain the whole product.

## 3. Mental Model: What Does M6 Add?

```txt
Developer
  |
  | opens Watch dashboard
  v
TanStack Start app (apps/dashboard)
  |
  +-- public routes
  |   +-- setup first owner       -> POST /auth/setup
  |   +-- login                   -> POST /auth/login
  |
  +-- protected app shell
      +-- current user            -> GET /me
      +-- projects/environments   -> GET/POST /api/projects
      +-- ingestion keys          -> POST /api/environments/{id}/keys
      +-- issue list/detail       -> GET/PATCH /api/issues...
      +-- rollup charts           -> GET /api/projects/{id}/rollups/...
```

The dashboard is not the monitoring engine. It is a thin, careful operational
interface over the server's existing API. Product rules such as auth, CSRF,
origin validation, event grouping, rollups, and retention stay in the Go server.
The dashboard should make those capabilities visible and ergonomic.

## 4. First Dashboard Surface

M6 should produce a usable vertical slice, not every future screen from the
roadmap. A developer should be able to:

1. Create the first owner account.
2. Log in and keep a session across refreshes.
3. Create a project with allowed origins.
4. Create an environment.
5. Mint and revoke ingestion keys.
6. Copy an SDK DSN for a project/environment.
7. See a project overview backed by rollups.
8. See issues, filter by status, inspect an issue, and change its status.
9. See Web Vital rollup buckets for `LCP`, `CLS`, `INP`, `FCP`, and `TTFB`.
10. Log out.

That is enough to close the loop from "install Watch locally" to "create a
project, send events, and inspect the result."

## 5. Frontend Platform Stack

M6 should establish a professional frontend platform, not only a working page.
The chosen stack should be boring enough to maintain and strong enough to
support a polished dashboard.

| Concern | Choice | Why |
|---------|--------|-----|
| App framework | TanStack Start with Vite | Full-stack React, SSR-capable routes, file-based routing, and a modern Vite build path. |
| Routing | TanStack Router through Start | Typed navigation, nested app shell routes, URL-backed filters, loaders, and search param validation. |
| Server state | TanStack Query | Dashboard data is remote server state; Query handles caching, refetching, mutation invalidation, and pagination better than ad hoc hooks. |
| Forms | TanStack Form plus schema validation | Gives type-safe form composition for production forms without burying validation in components. |
| UI primitives | shadcn/ui, Tailwind CSS, Radix primitives, lucide icons | Accessible primitives, owned component source, consistent utility styling, and familiar iconography. |
| Tables | shadcn table guidance plus TanStack Table | Issues and projects need filtering, pagination, sorting, and row actions without locking into a generic datagrid. |
| Charts | shadcn chart guidance plus Recharts | Rollups need clear line/bar charts; shadcn's chart pattern keeps Recharts visible instead of hiding it behind a local black box. |
| Unit/component tests | Vitest, React Testing Library, user-event | Fast tests for logic, rendering, forms, route components, and interaction behavior from the user's perspective. |
| API mocks | MSW | Reusable REST mocks for tests, Storybook, and local UI states. |
| Component workshop | Storybook with Vite/React | Build and review components in isolation with documented states, interactions, accessibility checks, and visual snapshots. |
| E2E tests | Playwright | Real browser coverage for auth, onboarding, issue workflows, and responsive shell behavior. |
| Accessibility | Storybook a11y, Playwright axe checks, keyboard review | Accessibility is a product quality gate, not an afterthought. |
| Visual quality | Storybook stories, visual regression checks, responsive screenshots | Protects the modern, polished UI from accidental regressions. |
| Formatting/linting | Existing Biome + TypeScript strictness | Keep consistency with the repo instead of adding overlapping lint systems first. |

Set these up incrementally. Do not dump every dependency into the first PR. The
platform should grow in the same order a user sees value: scaffold, UI
foundation, API client, auth, shell, onboarding, data screens, then richer
quality gates.

The repo is already a pnpm + Turborepo monorepo with root scripts for `build`,
`dev`, `test`, `lint`, and `typecheck`. `apps/dashboard/package.json` should
participate in those scripts the same way `apps/server`, `packages/browser`,
`packages/contracts`, and `packages/react` do.

## 6. Source Documentation Notes

These notes capture what matters from the official docs so the implementation
does not start from memory:

- TanStack Start is documented as a full-stack React framework powered by
  TanStack Router, with SSR, streaming, server functions, and Vite/Rsbuild build
  support. For Watch, use the Vite path unless the scaffold docs make a strong
  case otherwise at implementation time.
- TanStack Start setup can be created by CLI (`npx @tanstack/cli@latest create`)
  or from official examples. Since Watch already has a monorepo, prefer the
  least-destructive scaffold path inside `apps/dashboard` and review generated
  files before committing.
- TanStack Start's manual setup recommends TypeScript with `jsx: "react-jsx"`,
  `moduleResolution: "Bundler"`, `module: "ESNext"`, `target: "ES2022"`, and
  strict null checks. Align `apps/dashboard/tsconfig.json` with the existing
  repo base config while preserving Start requirements.
- shadcn/ui's Vite docs include monorepo guidance and a `-c apps/web` style
  component target. For Watch, use `apps/dashboard` as the target and keep
  copied components in a clear local path such as `apps/dashboard/src/components/ui`.
- Storybook's installer auto-detects project dependencies, supports pnpm, and
  has explicit testing docs for Vitest, accessibility, visual testing, and CI.
  Install it only after the dashboard has a working Vite/React scaffold.
- Vitest currently requires Node 20+ and Vite 6+. Watch already requires
  Node >=22, which fits. Use Vitest for unit and component tests, not for full
  browser journey tests.
- React Testing Library encourages tests that resemble how users interact with
  the UI. Prefer labels, roles, text, and keyboard interactions over component
  internals.
- MSW intercepts requests at the network layer and can be reused in browser and
  Node environments. Use one set of Dashboard API handlers for Storybook,
  Vitest, and mocked Playwright scenarios.
- Playwright installs a test runner, browser projects, reports, traces, and
  optional GitHub Actions workflow. Configure it to start the dashboard app and,
  for full smoke tests, the Go server/Postgres stack.
- WCAG and Storybook accessibility guidance both point to keyboard navigation,
  screen reader support, and sufficient contrast as baseline requirements.

## 7. Proposed App Structure

Exact filenames may change with the TanStack Start scaffold, but the ownership
boundaries should stay stable.

| Area | Responsibility |
|------|---------------|
| `src/routes/` | Public auth routes and protected dashboard routes. Route files should stay thin and delegate UI to feature components. |
| `src/components/ui/` | shadcn/ui copied primitives owned by Watch. Keep local edits intentional and documented. |
| `src/components/shell/` | App frame, navigation, selectors, account menu, responsive layout. |
| `src/components/forms/` | Focused forms for setup, login, project creation, environment creation, and key actions. |
| `src/components/issues/` | Issue table, status controls, issue detail summary. |
| `src/components/charts/` | Small chart primitives for error and vital rollup buckets. |
| `src/features/auth/` | Setup, login, session bootstrap, logout, protected route behavior. |
| `src/features/projects/` | Project onboarding, environments, ingestion keys, DSN copy flow. |
| `src/features/overview/` | Overview summaries and rollup widgets. |
| `src/features/issues/` | Issue list, issue detail, filters, status actions. |
| `src/features/vitals/` | Web Vital metric selection, rollup chart, bucket summaries. |
| `src/lib/api/` | Typed Dashboard API client, response parsing, CSRF header handling, error normalization. |
| `src/lib/auth/` | Session bootstrap, token storage policy, logout flow. |
| `src/lib/project-context/` | Selected project/environment state and persistence. |
| `src/lib/time/` | Shared time-range helpers for rollup queries. |
| `src/mocks/` | MSW handlers and mock data shared by tests and Storybook. |
| `src/stories/` or colocated `*.stories.tsx` | Storybook stories for primitives, components, and screen states. |
| `src/test/` | Vitest setup, test utilities, render helpers, mock server setup. |
| `e2e/` | Playwright specs for real browser flows. |

Keep `lib/api/` as the single frontend boundary around the Dashboard API. UI
components should call small domain functions such as `listProjects()` or
`updateIssueStatus()`, not hand-build `fetch` calls throughout the tree.

Prefer feature folders for product behavior and a small shared component layer
for durable UI primitives. A feature may have its own components, tests, stories,
and data hooks. Shared UI should graduate out of a feature only when at least
two real screens need it.

## 8. Dashboard API Surface Used In M6

Public auth routes:

| Method | Path | Used for |
|--------|------|----------|
| `POST` | `/auth/setup` | Create the first owner account. |
| `POST` | `/auth/login` | Log in, set the session cookie, receive CSRF token. |

Session routes:

| Method | Path | Used for |
|--------|------|----------|
| `GET` | `/me` | Bootstrap the current user. |
| `POST` | `/auth/logout` | End the session and clear the cookie. |

Dashboard routes, all requiring session plus CSRF for mutations:

| Method | Path | Used for |
|--------|------|----------|
| `GET` | `/api/projects` | List projects, environments, and keys. |
| `POST` | `/api/projects` | Create a project with allowed origins. |
| `POST` | `/api/projects/{id}/environments` | Create an environment. |
| `POST` | `/api/environments/{id}/keys` | Mint an ingestion key. |
| `DELETE` | `/api/keys/{id}` | Revoke an active key. |
| `GET` | `/api/projects/{id}/issues` | List issues for a project/environment. |
| `GET` | `/api/issues/{id}` | Fetch issue detail. |
| `PATCH` | `/api/issues/{id}/status` | Mark an issue open, resolved, or ignored. |
| `GET` | `/api/projects/{id}/rollups/errors` | Read hourly error buckets. |
| `GET` | `/api/projects/{id}/rollups/vitals` | Read Web Vital buckets and health scores. |

M6 should not add dashboard-only read paths until the current endpoints are
exercised in a real UI. If a screen cannot be built without a new endpoint,
add the smallest server endpoint that matches a real workflow and cover it with
server tests.

## 9. Key Design Decisions

### Auth state is server-owned

The session cookie is `HttpOnly`, so dashboard JavaScript cannot read it. That
is good: the server owns authentication. The dashboard learns whether it is
logged in by calling `GET /me`.

The CSRF token is different. It is returned in the login response body because
the dashboard JavaScript must attach it to mutating `/api/*` requests. Store it
only in memory at first. If refresh persistence is needed, add a deliberate
server endpoint to return or rotate the CSRF token for the active session rather
than inventing a local workaround.

### Setup and login are separate flows

`POST /auth/setup` creates the first owner and returns `409` once setup is
complete. The dashboard should use that to route users:

- Fresh deployment: show setup.
- Setup complete: show login.
- Authenticated: show the app shell.

The setup screen should not expose extra organization/user-management concepts
yet. M6 needs one owner so the product can be used.

### The selected environment is required context

Issue and rollup endpoints require `environment_id`. The app shell should make
project and environment selection a first-class control. If a project has no
environment, the dashboard should guide the user to create one before rendering
empty charts that cannot query anything.

### Onboarding is part of the product, not a marketing page

The first screen after login should help the user create a project and key. It
should not be a generic landing page. The dashboard becomes useful when the user
has a DSN they can put into `@watch/browser`.

### API errors need one consistent shape

Server errors return JSON like `{"error":"..."}`. The frontend API client should
normalize every failed response into one local error type so forms, tables, and
charts can display compact, consistent failures. Avoid scattering `response.ok`
branches through UI components.

### Charts should be humble at first

M6 charts only need to make recent trends readable. Favor small, reliable
visualizations over a heavy analytics layer. If a charting dependency is added,
wrap it behind local chart components so replacing it later is possible.

### Keep the dashboard dense and operational

Watch is an operational tool. The UI should feel quiet, scannable, and fast:
clear tables, compact filters, predictable navigation, restrained visual style,
and no decorative hero surfaces inside the app.

### Storybook is a product surface

Storybook should not be an afterthought or a toy shelf. Every reusable component
should have stories for default, loading, empty, error, disabled, keyboard
focused, long-text, and narrow-width states where relevant. Screen-level stories
should use MSW to render realistic Dashboard API states.

### Test from smallest stable contract to full journey

Use the cheapest test that gives confidence:

- Pure helpers and API parsing: Vitest unit tests.
- Components and forms: React Testing Library with user-event.
- Shared UI states: Storybook stories plus interaction/accessibility tests.
- Full auth and onboarding flows: Playwright.
- Backend-integrated smoke path: Playwright against the Go server and Postgres.

Avoid asserting implementation details such as internal component state or CSS
class strings unless the class is itself a contract.

### Design quality is explicit work

The dashboard should not look like scaffolded admin UI. Design system work gets
its own tasks: tokens, typography, spacing, density, interaction states,
responsive behavior, empty states, data visualization rules, and accessibility
review. Do not hide design work inside feature PRs once the foundation exists.

## 10. Quality Strategy

M6 should introduce multiple layers of confidence. "All kinds of tests" does
not mean testing everything in every way. It means each risk has the right gate.

| Layer | Tooling | Covers | Required by |
|-------|---------|--------|-------------|
| Type checks | TypeScript, generated route types | API types, route params, search params, component props | Every PR |
| Lint/format | Biome plus existing repo scripts | Style consistency and simple correctness | Every PR |
| Unit tests | Vitest | API client parsing, time helpers, URL/DSN helpers, reducer-like logic | Any logic PR |
| Component tests | Vitest + React Testing Library + user-event | Forms, buttons, selectors, tables, status actions, keyboard interaction | UI behavior PRs |
| API mock tests | MSW | Success, auth failure, validation error, 500, empty data, slow response states | API and screen PRs |
| Storybook stories | Storybook | Visual states, component docs, mocked screen states | Shared UI PRs |
| Storybook interaction tests | Storybook Vitest addon | Component interactions that belong near stories | Shared UI PRs |
| Accessibility checks | Storybook a11y, axe with Playwright, manual keyboard pass | Common WCAG failures, focus order, labels, contrast, keyboard traps | Shared UI and screen PRs |
| Visual regression | Storybook visual tests or Chromatic | Layout, spacing, color, responsive visual states | Design-system and core screens |
| E2E tests | Playwright | Login, onboarding, DSN creation, issue workflow, logout | Feature workflows |
| Integrated smoke | Playwright + server + Postgres | End-to-end Watch loop from project creation to ingested data visibility | End of M6 |

Test naming should describe user behavior or domain behavior, not implementation
details. Example: `shows setup when no owner exists`, not `renders SetupForm`.

## 11. Design System Direction

The design system should start as a small Watch-specific layer on top of
shadcn/ui, not a separate package on day one. Extract a package later only if
multiple apps need it.

Initial design principles:

- Dense, calm, operational layouts. This is a monitoring dashboard, not a
  marketing site.
- Clear information hierarchy: project, environment, time range, health status,
  and next action should be visible without hunting.
- Professional data displays: tables and charts should support scanning,
  comparison, filtering, and status triage.
- Fast empty states: every empty state should answer "what can I do next?"
- Accessibility by default: visible focus, keyboard paths, labels, contrast,
  reduced-motion support, and no color-only status communication.
- Stable layout under real data: long project names, long routes, many issues,
  missing rollups, and narrow screens must not break the interface.
- Modern but not trendy: use restraint, sharp spacing, excellent typography,
  clear affordances, and thoughtful motion only where it improves orientation.

Early tokens and primitives to define:

- Color tokens: background, surface, border, text, muted text, success, warning,
  danger, info, chart series, and status severity.
- Typography: page title, section heading, table text, metric number, label,
  helper text, code/DSN text.
- Spacing and density: compact table rows, form rhythm, toolbar gaps, chart
  height, shell gutters, mobile breakpoints.
- Interaction states: hover, active, selected, disabled, loading, error, focus.
- Components: button, input, textarea, select, tabs, table, badge, alert, empty
  state, skeleton, dialog, sheet, tooltip, metric card, chart shell, code copy.

This design system work should begin after the scaffold and shadcn base are in
place, but before most product screens are built. That order keeps the UI from
drifting into a mismatched collection of one-off components.

## 12. Task Breakdown

Each task should be one PR, branched off `main`.

### Task 1 - `feat/m6-docs-and-tooling-research`

Keep this document current with the official setup links above. Decide the exact
commands for TanStack Start, shadcn/ui, Storybook, Vitest, MSW, and Playwright
from current docs before implementation. This task is complete when the team can
review the frontend platform choices and the setup order without ambiguity.

### Task 2 - `feat/m6-dashboard-scaffold`

Scaffold the TanStack Start app in `apps/dashboard`, wire it into pnpm and
Turborepo, and add build, dev, lint, test, and typecheck scripts. Keep the first
screen minimal: a route renders, the app builds, and CI commands include the
dashboard package. Preserve the repo's existing package manager, Node version,
Biome setup, and Turborepo task shape.

### Task 3 - `feat/m6-shadcn-foundation`

Install Tailwind/shadcn/ui against the dashboard app using the official Vite and
monorepo guidance. Add the first owned primitives: button, input, label, field,
card, alert, badge, table, tabs, select, dialog/sheet, skeleton, tooltip, and
sonner/toast if needed. Add lucide icons for icon buttons and navigation.

### Task 4 - `feat/m6-storybook-foundation`

Install Storybook for the dashboard's React/Vite setup. Add stories for the
initial UI primitives and shell states. Configure global styling, viewport
testing, controls, backgrounds if useful, and the a11y addon. Add scripts for
`storybook` and `build-storybook`.

### Task 5 - `feat/m6-test-foundation`

Install and configure Vitest, React Testing Library, user-event, MSW, and
Playwright. Add shared test utilities, MSW handlers for the current Dashboard
API, one component test, one API client unit test, one Storybook interaction or
a11y test, and one minimal Playwright route smoke test.

### Task 6 - `feat/m6-design-system-foundation`

Define the first Watch design tokens and dashboard-specific component patterns:
typography, spacing, density, status colors, chart colors, focus states, empty
states, loading states, error states, and responsive shell rules. Capture them
in Storybook with states that a reviewer can inspect.

### Task 7 - `feat/m6-dashboard-api-client`

Add the typed Dashboard API client: request helper, credentials handling,
CSRF-header support, JSON/error parsing, route functions for auth, projects,
issues, and rollups, plus focused tests around success, validation errors,
unauthorized responses, and server errors.

### Task 8 - `feat/m6-auth-screens`

Build setup, login, logout, session bootstrap, and protected-route behavior.
`GET /me` decides whether the app shell or auth screens render. Mutations after
login must include the CSRF token. Cover setup, login failure, successful login,
refresh bootstrap, and logout in tests.

### Task 9 - `feat/m6-app-shell`

Build the operational shell: navigation, project selector, environment selector,
account/logout control, responsive layout, and stable empty states when no
project or environment exists. Include keyboard navigation, narrow viewport, and
long-name stories/tests.

### Task 10 - `feat/m6-project-onboarding`

Build project onboarding: create project with allowed origins, create
environment, mint key, revoke key, and show the copyable SDK DSN. This task
should make a fresh deployment usable with the browser SDK. Include MSW-backed
Storybook states and Playwright coverage for the happy path.

### Task 11 - `feat/m6-overview-rollups`

Build the first overview screen using existing rollup endpoints: recent error
buckets, one selected Web Vital trend, compact metric summaries, time-range
controls, loading states, empty states, and API failure states. Use chart
components with fixed responsive dimensions so real data cannot collapse layout.

### Task 12 - `feat/m6-issues`

Build issue list and issue detail screens. Include status filtering,
pagination/offset controls, status changes (`open`, `resolved`, `ignored`), and
clear treatment of empty issue lists. Cover row actions, status mutation errors,
pagination, and keyboard table navigation.

### Task 13 - `feat/m6-web-vitals`

Build the Web Vitals screen using `GET /api/projects/{id}/rollups/vitals`.
Provide metric selection for `LCP`, `CLS`, `INP`, `FCP`, and `TTFB`, display p75,
mean, sample count, and bucket health score, and preserve project/environment
context.

### Task 14 - `feat/m6-visual-and-a11y-hardening`

Run a focused visual and accessibility pass over the shell, onboarding, overview,
issues, and Web Vitals screens. Add or tighten Storybook visual coverage,
Playwright axe checks, manual keyboard notes, reduced-motion behavior, and
responsive screenshots.

### Task 15 - `feat/m6-dashboard-smoke`

Add an end-to-end or smoke path for the core local workflow: start server with
Postgres, create/login owner, create project/environment/key, submit at least
one event through ingestion, and verify dashboard routes can read the resulting
project data. If full automation is too heavy at this point, add the smallest
repeatable scripted/manual verification documented in the PR.

## 13. What Is Intentionally NOT In M6

- **Alerts UI** - M7 adds alert rules and delivery.
- **Release and source-map UI** - M8 adds release APIs and source map upload.
- **Network failures screen** - the SDK captures network events, but the current
  M5 rollup API only exposes error and Web Vital buckets. Add this after the
  server has a dedicated query shape.
- **Asset/chunk failure screen** - same as network failures: wait for a focused
  server read model.
- **User and role management** - M6 uses the first owner account. Full user
  administration can land after the dashboard proves the main monitoring loop.
- **OIDC or trusted-header auth** - deferred by the auth model.
- **Custom dashboard builder** - explicitly outside v1 scope.
- **Raw event explorer** - useful later, but M6 should prove processed issues
  and rollups first.
- **Separate published design-system package** - start inside `apps/dashboard`.
  Extract later only if multiple apps need the same UI library.
- **Perfect visual design in the scaffold PR** - polish is real work and gets
  explicit design-system and hardening tasks.

## 14. Verification Checklist

Before considering M6 complete:

- A fresh developer can run the server, open the dashboard, create the first
  owner, and log in.
- The TanStack Start dashboard participates in the root pnpm/Turborepo scripts.
- shadcn/ui primitives are installed as Watch-owned source, with documented
  conventions for local edits.
- Storybook runs and contains useful stories for primitives, shell, auth,
  onboarding, overview, issues, and Web Vitals states.
- MSW handlers are reused by component tests, Storybook, and mocked browser
  scenarios.
- A logged-in user can create a project, environment, and ingestion key.
- The displayed DSN works with `@watch/browser`.
- Authenticated dashboard routes survive refresh when the session is valid.
- Mutating `/api/*` requests include CSRF protection.
- Logout clears the dashboard session state.
- Overview and Web Vitals screens handle loading, empty data, and API failures.
- Issues can be listed, inspected, and moved between `open`, `resolved`, and
  `ignored`.
- Unit and component tests cover API parsing, auth forms, onboarding forms,
  selectors, issue status actions, and rollup UI states.
- Playwright covers login, onboarding, project/environment/key creation, issue
  status change, logout, and at least one integrated smoke path.
- Accessibility checks cover common violations, and manual keyboard review notes
  exist for the main workflows.
- Visual regression coverage protects the design-system primitives and main
  dashboard screens.
- The dashboard participates in `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build`.
