# Watch — Agent Guide

Watch is a privacy-first, self-hosted production health monitor for frontend web apps — a pnpm + Turborepo monorepo (Go server in `apps/server`, TypeScript browser SDK in `packages/browser`). Start with [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/](docs/).

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
