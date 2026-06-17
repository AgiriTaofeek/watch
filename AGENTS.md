# Watch — Agent Guide

Watch is a privacy-first, self-hosted production health monitor for frontend web apps — a pnpm + Turborepo monorepo (Go server in `apps/server`, TypeScript browser SDK in `packages/browser`). Start with [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/](docs/).

## Engineering standards

Write code for the developer who will open this repository years later and need to understand it without a live explanation.

- Prefer clear domain names from [docs/glossary.md](docs/glossary.md) and nearby code over clever abbreviations.
- Keep modules small, cohesive, and explicit about ownership. A package should have one obvious reason to exist.
- Make control flow easy to follow. Avoid hidden global state, surprising side effects, and broad catch-all abstractions.
- Avoid spaghetti code. Keep orchestration, business rules, persistence, transport handlers, and presentation concerns separated.
- Avoid duplication that can drift. If the same rule, query shape, validation, or schema appears in multiple places, extract the shared concept or document why it must remain separate.
- Keep public APIs boring and stable. Add an abstraction only when it removes real duplication or protects a boundary that is likely to grow.
- Prefer explicit data flow over magic. Dependencies should be passed through constructors or function parameters, not reached through package globals.
- Keep functions short enough to scan. Split long functions around real concepts, not arbitrary line counts.
- Model invalid states out where practical. Use typed structs, enums, validation boundaries, and database constraints instead of relying on comments.
- Handle errors with context. Return or log enough detail to diagnose the failing operation without leaking secrets, credentials, tokens, payload bodies, or sensitive user data.
- Leave concise comments for non-obvious decisions, invariants, privacy constraints, security assumptions, and scalability tradeoffs.
- Update docs when a change alters product behavior, architecture, setup, configuration, data shape, or operational expectations.

## Dependency and documentation discipline

External packages are allowed when they clearly reduce risk or complexity, but every dependency becomes part of the product's maintenance burden.

- Before adding or changing usage of an external package, read the official documentation first. Prefer official docs, upstream examples, release notes, and migration guides over blog posts or guesses.
- Prefer standard-library and existing-repo solutions when they are clear and sufficient.
- Add a new dependency only when it has an active maintainer, a compatible license, a stable API, acceptable transitive dependencies, and a clear reason to exist in Watch.
- Keep dependency usage behind a small local boundary when replacing it later would otherwise be painful.
- Do not copy large snippets from documentation or Stack Overflow into the codebase. Adapt the idea, keep the code idiomatic, and cite only when a specific source explains a non-obvious decision.
- When upgrading a dependency, check changelogs for breaking changes, security fixes, and behavior changes, then test the affected paths.

## Design principles

Apply durable software engineering lessons from maintainable systems, refactoring practice, domain-driven design, reliable distributed systems, and high-quality delivery.

- Optimize first for correctness, clarity, and changeability. Performance work should be driven by measured bottlenecks or known product scale targets.
- Keep behavior close to the domain it belongs to. Product rules should not be hidden inside HTTP handlers, SQL strings, React components, or background job glue.
- Separate policy from mechanism. Business decisions, persistence mechanics, transport details, and scheduling should be independently testable where practical.
- Favor composition over inheritance-style hierarchies or deeply nested abstraction stacks.
- Make dependencies point inward toward stable domain concepts. Outer layers such as HTTP, database, SDK transport, dashboard UI, and alert delivery should adapt to the core model, not define it.
- Refactor continuously in small, behavior-preserving steps. Do not mix large refactors with unrelated feature work.
- When changing unclear or legacy behavior, add characterization tests first so existing behavior is captured before it is improved.
- Prefer reversible decisions. Keep experiments small, isolate risky choices, and avoid locking the project into a tool, schema, or abstraction before the need is proven.
- Design for failure: timeouts, cancellation, retries with limits, idempotency, backpressure, partial failures, and graceful degradation should be considered on production paths.
- Make state transitions explicit. Important lifecycle changes such as issue status, key revocation, alert delivery, retention deletion, and migration state should be visible in code and tests.
- Keep configuration explicit, validated at startup, and documented. Invalid configuration should fail fast with a clear error.
- Treat data models as long-lived contracts. Schema changes, event shapes, API responses, and SDK options need compatibility, migration, and rollback thinking.
- Prefer boring technology and simple designs until the product proves it needs more. Cleverness is a liability unless it buys clear operational value.

## Code review checklist

Before considering work done, review the diff as if another maintainer must support it in production.

- Does the code have one clear path through the main behavior?
- Are names consistent with the product language in `docs/`?
- Can a future developer find where the behavior belongs without searching the whole repo?
- Are privacy, security, retention, and operational failure cases handled explicitly?
- Are database migrations reversible in development and safe for existing data?
- Are user-facing errors clear while internal logs keep enough diagnostic detail?
- Are edge cases covered: empty input, malformed input, missing config, duplicate requests, retries, cancellation, timeouts, and partial failures?
- Is there automated coverage for the important behavior, not just the happy path?
- Did the change avoid unrelated refactors, formatting churn, and cleverness that makes the diff harder to trust?

## Scalability and operability

Build for the v1 scale target in [docs/architecture.md](docs/architecture.md), while keeping the design ready to grow deliberately.

- Treat ingestion, dashboard reads, workers, alerts, and retention as separate responsibilities even when they run in one Go binary.
- Pass `context.Context` through request, database, worker, and shutdown paths so work can be cancelled cleanly.
- Design database access with indexes, pagination, bounded queries, idempotency, and retention in mind.
- Prefer explicit limits for payload size, batch size, string length, retries, queue depth, and retention windows.
- Make failures visible through structured logs, clear errors, health checks, and dropped-event counters.
- Preserve privacy and security defaults as scalability features: collect only what is needed, redact aggressively, and avoid storing sensitive raw data.

## Testing expectations

Every meaningful change should include the right level of tests for its risk. Do not rely on manual checks alone when behavior can be verified automatically.

- Unit test pure logic, validation, redaction, grouping, scoring, sampling, and configuration parsing.
- Integration test database repositories, migrations, ingestion handlers, auth/session behavior, and worker flows.
- Contract/schema test event envelopes and SDK/server compatibility.
- Privacy test browser SDK defaults so cookies, storage, form fields, request bodies, response bodies, authorization headers, and sensitive query parameters are not collected by default.
- Regression test every bug fix before changing the implementation.
- Add focused end-to-end or smoke tests for critical user journeys such as project creation, key rotation, ingestion, dashboard reads, alert delivery, and retention.
- Keep tests deterministic, isolated, and readable. Use fixtures/builders when they make intent clearer, but avoid large opaque test setup.
- If a change cannot be fully tested yet, document the gap in the PR body and add the smallest useful automated coverage now.

## Commit & PR conventions

- **Branch:** `<type>/<scope>`, where `type` ∈ `feat | fix | chore | docs | refactor | test`. Always branch off an up-to-date `main`.
- **Commit title** (this becomes the single squash-merge commit on `main`): `<type>: <imperative, lowercase summary>`. No trailing period. **Do not** add `(#PR)` — GitHub appends it on merge.
- **Commit messages are generated at commit time from the actual staged diff — never reused from a predetermined list.**
- **PR body** auto-prefills from [.github/pull_request_template.md](.github/pull_request_template.md) (What & why / How to verify / Checklist). Fill the sections from the diff. The PR title equals the commit title above.
- **Changeset:** N/A unless the change touches the publishable `@watch/browser` package (see CONTRIBUTING.md).
- The repo is **squash-merge + linear history + branch protection** — no direct pushes to `main`; everything lands via PR.

## How the agent helps with commits/PRs

- **About to commit:** run `git diff --staged`, then propose a conforming commit title (plus a short body only if it adds real context), derived from those actual changes.
- **Opening a PR:** draft the body to match the template sections from the branch diff; the title equals the squash commit message.
- **Never commit or push on the user's behalf unless explicitly asked** — the user commits themselves. Offer the message; let them run `git commit`.

## Before pushing

Run the same checks CI runs:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Milestone workflow

Per-task learning walkthroughs live in [docs/milestone-1/](docs/milestone-1/). Each task is one `feat/m1-*` PR, built on the previous. See [docs/milestone-1/README.md §8](docs/milestone-1/README.md#8-task-breakdown) for the task breakdown.
