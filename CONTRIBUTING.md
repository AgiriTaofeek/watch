# Contributing to Watch

Quick start guide for working in this repository. For deeper context, see [docs/](docs/) — especially [docs/architecture.md](docs/architecture.md), [docs/roadmap.md](docs/roadmap.md), and [docs/monorepo-concepts.md](docs/monorepo-concepts.md).

## Prerequisites

Install these once, then forget about them:

- **Node 22** — pin via [.nvmrc](.nvmrc). If you use `nvm`, run `nvm use` from the repo root.
- **pnpm 10+** — `npm install -g pnpm` or `corepack enable && corepack prepare pnpm@latest --activate`.
- **Go 1.25+** — install from <https://go.dev/dl/>.
- **golangci-lint** — `brew install golangci-lint` on macOS, or follow <https://golangci-lint.run/welcome/install/>.

## First-time setup

```bash
git clone <repo-url> watch
cd watch
nvm use                                 # Node 22 from .nvmrc
pnpm install                            # installs all workspace deps
cp .env.example .env                    # local env defaults
```

That's it. `pnpm install` also wires Husky's git hooks via the `prepare` script. If hooks are missing, run `pnpm exec husky init` once and overwrite `.husky/pre-commit` with `pnpm exec lint-staged`.

## Repository layout

```
apps/
  server/        Go service: ingestion API, dashboard API, worker, alerts
  dashboard/     TanStack Start dashboard (scaffolded in Milestone 6)
packages/
  browser/       Privacy-first browser SDK (TypeScript)
  contracts/     Shared TypeScript types (event envelope, etc.)
deploy/          Docker Compose and env examples
docs/            Product, architecture, security, roadmap docs
```

See [docs/architecture.md](docs/architecture.md) for what each piece is responsible for.

## Daily commands

All run from the repo root.

```bash
pnpm dev                                # run dev for all packages in parallel
pnpm build                              # build everything in dependency order, with caching
pnpm test                               # run all tests
pnpm lint                               # Biome on TS/JSON, golangci-lint on Go
pnpm typecheck                          # tsc --noEmit + go vet
pnpm format                             # auto-format with Biome
```

The first time you run `pnpm build`, expect cache misses. Run it again — you should see `FULL TURBO` and sub-second completion.

## Working on a specific package

Use `--filter` to scope commands to one package:

```bash
pnpm --filter @watch/browser dev        # dev mode for just the SDK
pnpm --filter @watch/browser test       # run only SDK tests
pnpm --filter @watch/server build       # build just the Go server
```

Or `cd` into a package and run the script directly:

```bash
cd packages/browser
pnpm test
```

## Where work happens

The roadmap drives this. See [docs/roadmap.md](docs/roadmap.md) for the full milestone list.

- **Milestone 1 (Ingestion Spine)** — work in `apps/server`. Go HTTP server, Postgres schema, project/environment model, ingestion key validation, raw event storage, local dashboard auth.
- **Milestone 2 (Browser SDK Core)** — work in `packages/browser`. Web Vitals, error capture, breadcrumbs, batching, redaction, privacy test suite. Shared types live in `packages/contracts`.
- **Milestone 6 (Dashboard)** — scaffold `apps/dashboard` via `npx @tanstack/cli@latest create` when this milestone starts.

## Branching and pull requests

Watch uses **GitHub Flow**: a single `main` branch that is always deployable. All work happens on short-lived feature branches off `main`, lands via pull request, and merges with squash-merge.

```
main  ───●───────●───────●───────●───  (always green, protected)
            ↑       ↑       ↑
        feat/x   fix/y   docs/z
```

### Workflow

1. Update local `main`:
   ```bash
   git checkout main && git pull
   ```
2. Create a branch named with a prefix that describes the change:
   - `feat/` — new feature or capability
   - `fix/` — bug fix
   - `chore/` — internal maintenance (deps, config, CI)
   - `docs/` — docs only
   - `refactor/` — code reshape with no behaviour change
   - `test/` — tests only
   ```bash
   git checkout -b feat/web-vital-collection
   ```
3. Commit incrementally. Push when ready:
   ```bash
   git push -u origin feat/web-vital-collection
   ```
4. Open a pull request against `main`. The PR template prompts for "what & why" + a verification checklist.
5. CI runs `pnpm lint && pnpm typecheck && pnpm test && pnpm build` on the PR. All must pass.
6. Once CI is green and review is complete, **squash-merge**. GitHub auto-deletes the feature branch.

### Rules enforced on `main`

- Direct pushes to `main` are blocked. Every change goes through a PR.
- Linear history is required: no merge commits.
- Force pushes and branch deletion are disabled.
- The `build` status check from CI must pass before merge is allowed.

If you need to break one of these (e.g. an emergency hotfix), an admin can temporarily disable protection — but the default is "everything goes through a PR."

## Code style

Style is enforced automatically — you should not need to think about it.

- **TypeScript / JSON / JSX** — formatted and linted by Biome via [biome.json](biome.json). Format-on-save is enabled in [.vscode/settings.json](.vscode/settings.json).
- **Go** — `gofmt` + `golangci-lint` (config in [apps/server/.golangci.yml](apps/server/.golangci.yml)).
- **Indentation / line endings / trailing whitespace** — [.editorconfig](.editorconfig) handles everything else (Markdown, YAML, shell scripts).

The pre-commit hook runs `lint-staged` which auto-fixes the files you've staged. If the hook blocks your commit, fix the reported error and try again.

## Adding a changeset

When you change something user-facing in a publishable package (currently `@watch/browser`), add a changeset before merging your PR:

```bash
pnpm changeset
```

Follow the prompts:

1. Pick the packages you changed.
2. Choose patch / minor / major per [semver](https://semver.org).
3. Write a one-line summary that will end up in `CHANGELOG.md`.

This creates a Markdown file in `.changeset/`. Commit it alongside your changes. Changesets are consumed when we cut a release.

See [docs/monorepo-concepts.md](docs/monorepo-concepts.md#changesets--versioning-and-changelogs-for-releases) for the full workflow.

## Releases

Watch releases are driven by [Changesets](https://github.com/changesets/changesets) + [.github/workflows/release.yml](.github/workflows/release.yml). You do **not** publish manually.

The flow:

1. Each PR that changes a publishable package includes a `.changeset/*.md` file (see "Adding a changeset" above).
2. When PRs merge to `main`, the release workflow notices accumulated changesets and **automatically opens** a "Version Packages" PR. This PR bumps versions in the affected `package.json` files and updates `CHANGELOG.md`.
3. When the "Version Packages" PR is merged, the workflow runs again: this time it publishes the bumped packages to npm and creates Git tags on `main`.

In short: merge regular PRs (with changesets) → review the "Version Packages" PR → merge it → release goes out.

### Prerequisites for the release flow to actually publish

- `NPM_TOKEN` repository secret set under [Settings → Secrets and variables → Actions](https://github.com/AgiriTaofeek/watch/settings/secrets/actions). Use an **Automation** token from <https://www.npmjs.com/settings/AgiriTaofeek/tokens>.
- `@watch/browser` flipped from `private: true` to `private: false` in [packages/browser/package.json](packages/browser/package.json).
- A `license` field added to the same `package.json`, paired with a `LICENSE` file at the repo root.

Until those three are in place, the workflow runs but the `pnpm changeset publish` step is a no-op (private packages are skipped). That's intentional — the plumbing exists; the publish only fires when you're ready.

## Before pushing

Run these locally — they're the same checks CI will run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI (see [.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every PR and push to `main`. A failing CI blocks merge.

## Commit messages

Keep them short and present-tense:

```
add web vital collection to browser SDK
fix retry backoff when ingestion API is down
docs: clarify trusted-header auth boundary
```

No formal convention is enforced (e.g. Conventional Commits). Just be descriptive.

## Reporting issues

For now the repo is private and discussion happens directly. Once Watch goes public, file issues at the project's issue tracker with a minimal reproduction and the affected milestone.

## Where to look when stuck

- **Architecture / concepts** — [docs/architecture.md](docs/architecture.md), [docs/how-watch-works.md](docs/how-watch-works.md), [docs/glossary.md](docs/glossary.md).
- **Tooling questions** — [docs/monorepo-concepts.md](docs/monorepo-concepts.md) explains every tool in plain language.
- **Setup questions** — [docs/monorepo-setup.md](docs/monorepo-setup.md) is the bootstrap reference.
- **Security and privacy** — [docs/security-privacy.md](docs/security-privacy.md), [docs/threat-model.md](docs/threat-model.md).
- **Event shapes** — [docs/event-taxonomy.md](docs/event-taxonomy.md).
