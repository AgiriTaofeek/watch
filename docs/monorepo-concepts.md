# Monorepo Concepts

A learning reference for the tooling used in the Watch monorepo. This document explains *what each tool is for* in plain language, assuming you have not used any of them before.

For the exact files and commands to set up the monorepo, see [monorepo-setup.md](monorepo-setup.md).

## How To Read This Document

Each section follows the same pattern: **the problem** → **what the tool does** → **a concrete example**. You should be able to skim the headings and read only the sections you're curious about.

If you hit a term you don't know, check the **Vocabulary** section below first.

## Vocabulary

These words appear throughout. If they are familiar already, skip ahead.

- **Package** — a folder containing source code, a manifest file, and (usually) some scripts. One project's worth of code.
- **Manifest** — a file inside a package that tracks its name, version, dependencies, and scripts. In JavaScript it is `package.json`; in Go it is `go.mod`.
- **Dependency** — another package that your code uses. For example, the browser SDK uses TypeScript, so TypeScript is a dependency.
- **Package manager** — a tool that reads your manifest, downloads dependencies from the internet, and puts them in a folder so your code can use them. `npm`, `pnpm`, and `yarn` are package managers for JavaScript.
- **Registry** — the website where package managers download packages from. For JavaScript it is the npm registry at <https://registry.npmjs.org>.
- **Lockfile** — a file (`pnpm-lock.yaml`) that records the *exact* version of every dependency installed. It guarantees that you and your teammates get bit-for-bit identical `node_modules` folders.
- **Script** — a named command saved in a manifest. Running `pnpm build` runs whatever is under `"scripts": { "build": "..." }` in `package.json`.
- **Build** — the process of turning source code into a runnable or shippable form (compiling TypeScript to JavaScript, bundling files, generating type declarations, etc.).
- **Lint** — automated checking for likely bugs and bad patterns in code. A linter is the tool that does it.
- **Format** — reshaping code's whitespace, quotes, and line breaks to a consistent style. A formatter is the tool that does it.
- **Monorepo** — a single Git repository containing multiple packages that ship together or share code.
- **CI (Continuous Integration)** — automated jobs that run on a server (e.g. GitHub Actions) every time you push code, usually to run tests, lint, and build.
- **Hook** (Git hook) — a script that Git runs automatically at certain moments (before a commit, before a push, etc.).
- **Staged file** — a file you have marked for inclusion in the next commit using `git add`. "Staging" is the act of doing that.
- **Pull request (PR)** — a proposal on GitHub (or GitLab, Bitbucket, etc.) to merge code from one branch into another. The PR is the unit of code review: people comment, CI runs against the proposed merge, and clicking "Merge" is what actually lands the change.
- **Branch protection** — server-side rules on GitHub that restrict what can happen on a branch (e.g. "no direct pushes to `main`", "CI must be green to merge"). Enforced by GitHub, not by a Git hook on the laptop.
- **GitHub Actions / workflow** — automated jobs defined in `.github/workflows/*.yml`. Each workflow is YAML describing steps to run on a GitHub-provided virtual machine in response to triggers like `push`, `pull_request`, or `release`.
- **Repository secret** — a value (like an npm token) stored encrypted in GitHub Settings. Workflows reference it via `${{ secrets.NAME }}` without the value ever appearing in code.

## Mental Model

When you create a new project, almost every language has a manifest file that tracks the project's dependencies, version, scripts, and metadata.

```
JavaScript / TypeScript  →  package.json
Go                       →  go.mod
Rust                     →  Cargo.toml
Python                   →  pyproject.toml
```

When a single repository contains **multiple packages** that share code or ship together, it's called a **monorepo**. Watch is a monorepo because it has four packages living side by side:

- `apps/server` — Go service (ingestion + dashboard API + worker)
- `apps/dashboard` — TanStack Start dashboard (React + TypeScript)
- `packages/browser` — TypeScript browser SDK
- `packages/contracts` — Shared TypeScript types

The tools below exist to make many packages in one repository behave like a single coordinated workspace.

## Manifest Files In This Repository

Every package has its own `package.json` (or `go.mod`). The **root** `package.json` is special:

- It is **private**, meaning it is never published to the npm registry.
- It holds dev-dependencies shared across the whole repository (Turborepo, Biome, Husky, etc.). "Dev-dependency" just means "a tool only used while developing, not at runtime."
- Its `scripts` are the entry points you type at the terminal (`pnpm build`, `pnpm test`, etc.).
- It declares the package manager version via `"packageManager": "pnpm@10.x"`.

Each package's own `package.json` declares its own dependencies, its own scripts, and its own version. They look like:

```json
{
  "name": "@watch/browser",
  "version": "0.0.0",
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "dependencies": {
    "@watch/contracts": "workspace:*"
  }
}
```

The `@watch/...` prefix is called a **scope**. It groups related packages under one name, similar to how `@types/node` is in the `@types` scope.

## pnpm Workspaces

**The problem:** "I have several packages in one repository. How do I install dependencies once for all of them, and let them depend on each other locally without uploading to a registry first?"

`pnpm-workspace.yaml` at the repository root tells pnpm which folders are workspace packages:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

With that file in place:

- **One install covers everything.** `pnpm install` at the root downloads dependencies for every package in one pass and creates one shared `node_modules`.
- **Local dependencies "just work."** A package can declare another local package as a dependency using the `workspace:` protocol — e.g. `"@watch/contracts": "workspace:*"` tells pnpm "use the local version of `@watch/contracts` from this monorepo, not a version from the npm registry."
- **Filtering targets one package.** You can run a script in only one package using `--filter`, e.g. `pnpm --filter @watch/browser test` runs the browser SDK tests and nothing else.
- **One lockfile pins everything.** A single `pnpm-lock.yaml` at the root records every dependency's exact version across the whole workspace.

> **Why pnpm specifically?** `npm`, `yarn`, and `pnpm` are all package managers that support workspaces. pnpm is faster, uses much less disk space (it stores each package once globally and hard-links it into projects), and has the strictest dependency resolution. For monorepos in 2026, pnpm is the default.

### What you actually run

```bash
pnpm install                       # install all deps for every package
pnpm --filter @watch/browser dev   # run the dev script in just one package
pnpm -r build                      # run build in every package
```

The `-r` flag means "recursive" — apply this command to every workspace package.

## Turborepo

**What pnpm does *not* solve:** orchestrating *work* across packages. pnpm installs dependencies. It does **not** know:

- What order to build packages in (build `@watch/contracts` before `@watch/browser` because browser imports from contracts).
- What can be skipped (if nothing in `@watch/contracts` changed, don't rebuild it).
- What can run in parallel (server and browser have no relationship, so build them at the same time).

Turborepo is a **task runner** that sits on top of pnpm workspaces. ("Task" here just means "a script run as part of building or testing.") It answers three questions.

### 1. What order should tasks run in?

`turbo.json` defines tasks and how they depend on each other:

```json
"build": {
  "dependsOn": ["^build"]
}
```

The `^build` notation means **"before building this package, build all of its workspace dependencies first."** So when you run `pnpm build` from the root:

1. Turbo notices `@watch/browser` depends on `@watch/contracts`.
2. It builds contracts first.
3. Then builds browser (which can now import from the built contracts).
4. Builds server in parallel because nothing connects it to the others.

### 2. What can I skip?

Turbo **hashes** the inputs of each task — its source files, configs, and dependencies. A hash is just a long string that uniquely represents a snapshot of inputs; if any input file changes by even one character, the hash changes.

If the hash matches a previous run, Turbo **replays the cached output** instead of running the task again.

A second `pnpm build` with no changes prints `FULL TURBO` and finishes in a few hundred milliseconds — it just hands back the cached `dist/` folder.

The `globalDependencies` field in `turbo.json` lists files that should invalidate every package's cache when they change. We include `tsconfig.base.json`, `biome.json`, `.nvmrc`, and `.editorconfig` there because edits to those affect every package.

### 3. What can run in parallel?

Any tasks not connected by `dependsOn`. Turbo uses all CPU cores automatically — no shell loops, no `&` background tricks.

### Without Turborepo

You would write something like:

```bash
pnpm --filter @watch/contracts build && \
pnpm --filter @watch/browser build && \
pnpm --filter @watch/server build
```

…and it would rebuild everything every time, in sequence, with no parallelism and no caching. Adding more packages makes it worse.

## How The Layers Fit Together

```
pnpm-workspace.yaml  →  "These folders are workspace packages."     (discovery)
package.json (root)  →  "Root scripts and root devDeps live here."  (entry point)
turbo.json           →  "Run tasks in this order. Cache results."   (orchestration)
biome.json           →  "Lint and format TS / JSON this way."       (code style)
```

The picture when you type `pnpm build` at the root:

```
pnpm build
  └── runs the root package.json "build" script: turbo run build
        └── Turbo reads turbo.json
              └── finds every workspace package via pnpm
                    └── runs each package's own "build" script
                          in the right order, in parallel, with caching
```

Each layer adds exactly one capability. Remove a layer and you lose just that piece.

## EditorConfig

`.editorconfig` is unrelated to the monorepo machinery. It belongs in the same conversation because it ships in the same project bootstrap.

**The problem:** different editors default to different indentation (some 2 spaces, some 4, some tabs), different line endings (LF on Mac/Linux, CRLF on Windows), and different ideas about trailing whitespace. Without a shared rule, opening the same file in two editors produces two different versions on save.

**What EditorConfig does:** a single `.editorconfig` file at the repository root that tells every contributor's editor the same rules. VSCode and JetBrains read it natively; other editors read it via a small extension. The format is documented at <https://editorconfig.org>.

Three jobs in this repository:

1. **Indentation per language** — 2 spaces everywhere, tabs in `.go` files (matching Go's standard).
2. **Line endings** — forces LF cross-platform so Windows contributors don't commit CRLF.
3. **Whitespace hygiene** — trims trailing whitespace and ensures every file ends with a newline.

It overlaps with Biome (which formats TypeScript / JSON) and `gofmt` (which formats Go), but it covers the gap: Markdown, YAML, `.env` files, shell scripts, and the editor's *initial* behavior before any formatter runs. Without `.editorconfig`, a new contributor's editor might insert tabs into a TypeScript file and Biome would have to fight them on every save.

You can delete `.editorconfig` and Biome + gofmt still enforce formatting on the languages they own — but you'll lose consistency in the file types nothing else covers.

## Biome

**The problem:** JavaScript has two long-standing tools — **ESLint** for linting (catching likely bugs) and **Prettier** for formatting (whitespace, quotes, semicolons). Two tools means two configs, two slow Node processes on every save, and constant conflicts to resolve where they disagree on a rule.

**What Biome does:** one Rust-based tool that does both jobs. One config file (`biome.json`), one fast process, no overlap to manage.

Biome only knows TypeScript, JavaScript, JSON, and JSX. Go has its own tools (`gofmt`, `golangci-lint`), so Biome's scope ends where the Go service begins.

## Husky — Share Git Hooks With Your Team

**The problem:** Git has a built-in feature called **hooks** — scripts that run automatically at certain moments (`pre-commit` runs right before a commit is created, `pre-push` runs right before a push, and so on). The catch: hooks live in `.git/hooks/`, and the `.git/` folder is **not** committed to your repository. So if you set up a hook on your laptop, none of your teammates get it. Every new contributor starts with zero hooks.

**What Husky does:** moves your hook scripts into a regular folder (`.husky/`) that *is* committed. When anyone runs `pnpm install`, Husky symlinks those scripts back into `.git/hooks/` so Git picks them up. End result: every contributor automatically gets the same hooks, just by cloning and installing.

**What it looks like:**

```
.husky/
├── pre-commit         ← runs every time you `git commit`
├── pre-push           ← runs every time you `git push`
└── commit-msg         ← runs to validate the commit message
```

Each file is a normal shell script. Our `pre-commit` is literally one line: `pnpm exec lint-staged`.

**A concrete example:**

```
$ git commit -m "fix typo"
[husky] running pre-commit hook
  ✔ ran biome on 2 staged files
  ✔ no lint errors
[master a1b2c3d] fix typo
```

If the hook fails (lint errors, failing test, anything that exits non-zero), the commit is **blocked**. You fix the issue, re-add the files, and retry.

## lint-staged — Only Check The Files You're Committing

**The problem:** a naive pre-commit hook runs `pnpm lint` on the entire repository. In a small project that's two seconds; in a 50,000-file monorepo it's 30+ seconds *every commit*. Worse, it can fail on a pre-existing issue in code you didn't touch — blocking your unrelated fix until someone cleans up the old issue.

**What lint-staged does:** looks at exactly which files `git add` has marked as **staged** for this commit, and runs commands only on those files. It piggybacks on Husky — Husky calls `lint-staged`, lint-staged then runs the actual commands.

> **Reminder:** "staged" means a file you've added with `git add`. Git keeps two layers: your working directory (every file on disk) and the staging area (files marked for the next commit). lint-staged only touches the second layer.

**How it's configured:** in the root `package.json`:

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx,json,md}": [
    "biome check --write --no-errors-on-unmatched"
  ]
}
```

This says: "for any staged file matching these extensions, run `biome check --write` on just those files."

**Why it's clever:** `biome check --write` *auto-fixes* formatting issues. lint-staged then re-stages the modified file automatically, so the formatting fix goes into the same commit. You don't even notice it happened — your commit just ends up cleaner than what you typed.

**The full flow:**

```
1. You edit src/api.ts and src/util.ts (with bad spacing).
2. git add src/api.ts src/util.ts          ← these are now "staged"
3. git commit -m "add endpoint"
4. Husky fires .husky/pre-commit
5. The hook runs `pnpm exec lint-staged`
6. lint-staged sees the 2 staged .ts files, runs Biome on just them
7. Biome rewrites the bad spacing in both files
8. lint-staged re-stages the rewritten files
9. The commit goes through, containing the cleaned-up code
```

If Biome found a real bug (not just formatting), the commit aborts with an error message explaining what to fix.

## Husky + lint-staged Together

They are almost always used as a pair. The mental model:

- **Husky** = "where and when does code run?" → answer: `.husky/pre-commit`, every commit
- **lint-staged** = "what code runs?" → answer: just the staged files, with these tools

You could use Husky without lint-staged (e.g. run the whole test suite on `pre-push`). You could use lint-staged without Husky (call it manually from a CI script). But the standard combo is: Husky installs the hook, the hook calls lint-staged, lint-staged runs Biome / Prettier / ESLint / etc. on staged files only.

## Changesets — Versioning And Changelogs For Releases

**A completely different concern.** Husky and lint-staged operate per-commit. Changesets operates per-**release**. When you publish a package to the npm registry, you need to:

1. Decide how big the change is — patch, minor, or major. (See "Semver" below.)
2. Update `package.json`'s `"version"` field accordingly.
3. Write a `CHANGELOG.md` entry describing what changed for users.
4. Tag the Git commit and run `npm publish`.

Doing this manually across many packages in a monorepo is tedious and error-prone — especially if `@watch/browser` depends on `@watch/contracts` and bumping contracts should also bump browser.

> **Semver (Semantic Versioning):** a 3-number version like `1.4.7`. The rules:
>
> - **Patch** (`1.4.7 → 1.4.8`): bug fix, no behavior change for users.
> - **Minor** (`1.4.7 → 1.5.0`): new feature added, but existing usage still works.
> - **Major** (`1.4.7 → 2.0.0`): breaking change — users will need to update their code.

**What Changesets does:** automates steps 1–4.

### The developer workflow

After making a code change, before merging your PR, run:

```bash
pnpm changeset
```

This is an interactive prompt:

```
🦋  Which packages would you like to include? @watch/browser
🦋  Which packages should have a major bump? (none)
🦋  Which packages should have a minor bump? @watch/browser
🦋  Please enter a summary for this change:
    Added retry-with-backoff for failed event submissions.
```

It creates a tiny Markdown file in `.changeset/` with a random name like `quiet-foxes-dance.md`:

```markdown
---
"@watch/browser": minor
---

Added retry-with-backoff for failed event submissions.
```

You commit that file as part of your PR. It accumulates across many PRs until release time.

### When you decide to ship a release

```bash
pnpm changeset version    # reads all .changeset/*.md files, bumps versions, rewrites CHANGELOG.md, deletes the .md files
pnpm changeset publish    # runs `npm publish` for every package that changed
```

The first command turns this:

```
.changeset/
├── quiet-foxes-dance.md       (minor bump for @watch/browser)
├── happy-birds-sing.md        (patch bump for @watch/contracts)
└── brave-mountains-fall.md    (minor bump for @watch/browser)
```

…into:

- `packages/browser/package.json` → bumped from `0.1.0` to `0.2.0` (highest of all browser changes).
- `packages/contracts/package.json` → bumped from `0.0.5` to `0.0.6`.
- `packages/browser/CHANGELOG.md` → new section with both summaries.
- The `.changeset/*.md` files deleted (they've been consumed).

The second command actually publishes to npm.

### Why it's worth setting up

- The version-bump decision happens at PR time, when you remember what you changed — not at release time, when you've forgotten.
- The changelog writes itself.
- Cross-package version coordination is automatic.

**Not used until you publish.** We set Changesets up now so the plumbing exists. No one runs `pnpm changeset` until `@watch/browser` is ready to ship to the npm registry. Until then the `.changeset/` folder just sits empty.

## Branching Model

**The problem:** in a team, multiple people change code at once. You need a rule for *where* changes go while they're in progress and *when* they become "real."

There are three popular patterns. Watch uses the simplest of them — **GitHub Flow** — but it helps to know the others exist so you can recognise them in other codebases.

### GitHub Flow (what Watch uses)

```
main  ───●───────●───────●───────●───  (always deployable, protected)
            ↑       ↑       ↑
        feat/x   fix/y   docs/z
```

- `main` is the trunk. Every commit on `main` is releasable.
- Every change starts on a **short-lived feature branch** off `main`.
- You open a **pull request** (PR) against `main`. CI runs lint + typecheck + test + build. Reviewers comment. You push fixes.
- When CI is green and review is done, the PR is **squash-merged** — collapsing all branch commits into one neat commit on `main`.
- Releases are **Git tags** on specific `main` commits, not branches.

This is what most modern web projects use. It pairs cleanly with Changesets (versioning lives in `.changeset/*.md` files, not in branch names) and with continuous deploy (whatever's on `main` is what runs).

### GitLab Flow (environment branches)

```
main ────→ staging ────→ production
              (auto)         (manual promote)
```

Adds long-lived environment branches that **lag** `main`. Merging is one-way (`main → staging → production`). Useful when production deploy needs a manual button or a soak period. Watch may add a single lagging branch later if it starts dogfooding a self-hosted instance.

### Git Flow (the dev/main model)

```
main     ─────●─────────●─────  (released versions, tagged)
develop  ──●──●──●──●──●──●──   (integration)
              ↑     ↑
           feat   release/v1.x
```

Two long-lived branches — `develop` for integration, `main` for released versions only — plus `release/*` and `hotfix/*` branches for stabilisation and emergency patches. Heavyweight. Was the standard 2010–2017. Now mostly used for shrink-wrapped software with strict version cadences. Watch doesn't need this — Changesets handles "what version is this?" without `release/*` branches.

### Branch naming in Watch

Prefix branch names so the intent is visible at a glance:

| Prefix | When to use |
| --- | --- |
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `chore/` | Internal maintenance (deps, config, CI) |
| `docs/` | Documentation only |
| `refactor/` | Code reshape with no behaviour change |
| `test/` | Tests only |

Example: `feat/web-vital-collection`, `fix/retry-backoff`, `chore/bump-go-1.26`.

### Pull Request Templates

**The problem:** PRs vary wildly in quality. Some have one-line descriptions, some have walls of context, some forget tests, some forget to add a changeset. A template gives every PR a baseline structure.

**What it does:** `.github/pull_request_template.md` is auto-loaded into the PR description whenever someone opens a new PR on GitHub. Whatever's in that file becomes the starting text. The author edits in their actual content; reviewers see a consistent shape.

Watch's template prompts for:

- **What & why** — the change and the motivation (not just the diff, which GitHub already shows).
- **How to verify** — steps a reviewer can follow to confirm it works.
- **Checklist** — lint passes, typecheck passes, tests pass, build succeeds, changeset added (if needed), docs updated, screenshots if UI.

The checklist isn't enforced by CI; it's a nudge for the author to think about completeness before requesting review.

### Branch Protection on GitHub

**The problem:** Naming conventions and PR-based workflows only work if everyone follows them. One accidental `git push origin main` from a half-finished branch can break production. Branch protection is GitHub enforcing the rules so accidents can't happen — server-side, not a hook on your laptop that you could `--no-verify` past.

**What it does:** rules configured per-branch under **Settings → Branches → Add rule** (classic UI) or **Settings → Rules → New ruleset** (newer UI). For Watch's `main` branch:

| Rule | Effect |
| --- | --- |
| Require a pull request before merging | Blocks direct `git push origin main`. |
| Require status checks to pass | The `build` job from `.github/workflows/ci.yml` must be green before merge is allowed. |
| Require branches to be up to date before merging | Forces feature branch to merge or rebase `main` before merging back. |
| Require linear history | Disallows merge commits — forces squash or rebase. |
| Block force pushes | `git push --force origin main` is rejected. |
| Block deletions | `git push --delete origin main` is rejected. |
| Require conversation resolution before merging | All review comments must be resolved before merge. |

A second batch of settings under **Settings → General → Pull Requests** controls *how* PRs merge:

- **Allow squash merging only** — disable merge commits and rebase merging.
- **Squash commit message: "Pull request title"** — the PR title becomes the single commit on `main`.
- **Automatically delete head branches** — feature branches are cleaned up after merge.

**Why squash-merge?** It collapses every commit on a feature branch into one tidy commit on `main`. `main`'s history becomes a clean timeline of finished work, not a tangled graph of "wip", "fix typo", "fix again" commits. The PR title is the public-facing commit message; the branch's internal commits get squashed away.

**Trying to push directly to `main` after protection is on:**

```
$ git push origin main
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Required status check "build" is expected.
 ! [remote rejected] main -> main (protected branch hook declined)
```

The first commit going through this gate is the one that *adds* the gate. After that, everything follows the rules.

**Two ways to configure protection.** Either is fine — they produce the same result.

- **Web UI:** click through Settings → Branches → Add rule, tick the boxes above. Most visible; good for solo devs.
- **`gh` CLI:** run `gh api --method PUT /repos/<owner>/<repo>/branches/main/protection -F ...`. Reproducible and version-controllable.

## Continuous Integration (CI)

**The problem:** "It worked on my machine" — code that passes locally on the author's laptop but breaks on someone else's. The fix is to run the same checks on a clean, neutral machine for every change, and refuse to merge if those checks fail.

**What it does:** `.github/workflows/ci.yml` is a GitHub Actions workflow that runs on every PR and every push to `main`. On a fresh Ubuntu virtual machine it:

1. Checks out the code.
2. Sets up Node, pnpm, Go, and installs golangci-lint.
3. Runs `pnpm install --frozen-lockfile` (fails if the lockfile is out of date).
4. Runs `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`.

The job is named `build`. That name is what branch protection's "required status check" refers to. If `build` fails or doesn't run, the PR cannot merge.

Two extra blocks in the workflow are worth noting:

- **`concurrency`** — if you push a second commit to the same PR while the first is still running, the older run is cancelled. Saves CI minutes and avoids stale status checks.
- **`permissions: contents: read`** — restricts the workflow's GitHub token to read-only access. Tighter security posture; bump up if a future step needs to write.

## Release Automation

**The problem:** Changesets gives you the *files* describing what changed, but somebody still has to run `pnpm changeset version` and `pnpm changeset publish` to actually cut a release. Doing that manually means forgetting it, doing it inconsistently, or accidentally publishing from a dirty working tree. It also requires the human to have an npm authentication token on their laptop.

**What it does:** `.github/workflows/release.yml` runs Changesets in CI on every push to `main`. The flow is two-phased:

```
1. PRs land on main, each carrying a .changeset/*.md file
        ↓
2. Release workflow notices pending changesets
        ↓
3. Workflow auto-opens (or updates) a "Version Packages" PR that:
     ├── bumps versions in every affected package.json
     ├── updates CHANGELOG.md for each changed package
     └── deletes the .changeset/*.md files (they have been consumed)
        ↓
4. You review and merge the "Version Packages" PR
        ↓
5. Workflow runs again. This time, no pending changesets exist,
   so it publishes instead:
     ├── pnpm changeset publish pushes packages to npm
     └── Git tags are created on main for each release
```

The result: releases are gated by merging a PR. No SSH-ing to a build machine. No "did I remember to push tags?" No inconsistent publish state across team members' laptops.

### The `NPM_TOKEN` secret

Publishing to npm requires authentication. The workflow reads `${{ secrets.NPM_TOKEN }}` from the repo's secrets store. You generate an **Automation** token on npmjs.com (this token type works in CI without prompting for 2FA) and add it under **Settings → Secrets and variables → Actions → New repository secret** with the name `NPM_TOKEN`.

Without `NPM_TOKEN`, the workflow still runs but the publish step skips — because either the secret is missing, or the package is still `private: true`, or both. That's intentional. The plumbing is wired before the publish path is opened.

### Why all three pieces matter together

| Piece | Without it... |
| --- | --- |
| Changesets (`.changeset/*.md`) | You have to remember bump types and write the CHANGELOG by hand. |
| Release workflow (`release.yml`) | You have to remember to run `pnpm changeset publish` manually from a known-good state. |
| `NPM_TOKEN` secret | Even with the workflow, npm rejects the publish for lack of auth. |

All three are required to ship `@watch/browser` cleanly. Each one alone is incomplete.

## Working Practices: A Day In The Life

This is how the tools fire as you work, from typing code to shipping a release.

```
1. git checkout -b feat/<topic>                                 (off main)
       ↓
2. You write code in your editor.
       ↓
       .editorconfig is silently in effect (indentation, line endings).
       Biome (via VSCode extension) reformats on save.
       ↓
3. git add some/files.ts                                        (staging)
       ↓
4. git commit -m "..."
       ↓
       Husky fires .husky/pre-commit
         └── runs `pnpm exec lint-staged`
               └── runs Biome on just the staged files
                     ├── auto-fixes formatting and re-stages
                     └── if there is a real bug, blocks the commit
       ↓
5. pnpm changeset                                               (if user-facing)
       ↓
       Pick affected packages, choose patch/minor/major, write a summary.
       Creates .changeset/<random-name>.md. Commit it on the same branch.
       ↓
6. git push -u origin feat/<topic>
       ↓
       (No hook by default — push happens normally.)
       ↓
7. Open a Pull Request on GitHub
       ↓
       The PR template (.github/pull_request_template.md) pre-fills the
       description with "What & why" + verification checklist.
       ↓
       GitHub Actions CI runs (.github/workflows/ci.yml):
         pnpm install → pnpm lint → pnpm typecheck → pnpm test → pnpm build.
       Turborepo caches kick in to speed this up.
       ↓
8. PR is reviewed. Branch protection blocks merge until:
       ├── the `build` status check is green
       ├── conversations are resolved
       └── the branch is up to date with main
       ↓
9. Squash-merge the PR
       ↓
       GitHub collapses every commit on the feature branch into one
       commit on main using the PR title as the message, then auto-deletes
       the feature branch.
       ↓
       ...repeat steps 1–9 many times per week...
       ↓
10. Release workflow (.github/workflows/release.yml) auto-opens a
    "Version Packages" PR when pending changesets accumulate on main.
       ↓
       Bumps versions in package.json files.
       Updates CHANGELOG.md per package.
       Deletes the consumed .changeset/*.md files.
       ↓
11. Maintainer reviews and merges the Version Packages PR.
       ↓
       Release workflow runs again. This time it publishes:
         ├── pnpm changeset publish pushes new versions to npm
         └── Git tags are created on main for each released package
       ↓
12. Users on npm see the new version.
```

The repeating loop (steps 1–9) happens many times per week. Steps 10–12 happen on each release — could be every day, every sprint, or once a month. The release loop runs automatically; the only human step is reviewing and merging the Version Packages PR when you're ready to ship.

## Quick Reference

| Tool / File | Layer | What it does |
| --- | --- | --- |
| `package.json` | Manifest | Tracks deps, version, scripts for one package |
| `go.mod` | Manifest | Same idea, for Go |
| `pnpm-workspace.yaml` | Workspace discovery | Tells pnpm which folders are packages |
| pnpm | Package manager | Installs deps, links workspace packages |
| `pnpm-lock.yaml` | Lockfile | Pins every dep's exact version |
| `turbo.json` | Task orchestration | Order, caching, parallelism for scripts |
| Turborepo | Task runner | Reads `turbo.json` and runs the scripts |
| `biome.json` | Code style | Lint + format config for TS / JSON |
| Biome | Linter + formatter | The tool that reads `biome.json` |
| `.editorconfig` | Editor defaults | Cross-editor indentation + EOL + whitespace |
| `.husky/` | Git hooks | Scripts that run on commit / push |
| Husky | Hook installer | Makes hooks committed and shared across the team |
| `lint-staged` | Hook helper | Limits hook actions to staged files |
| Changesets | Release tooling | Versioning + changelog automation |
| `.github/workflows/ci.yml` | CI workflow | Runs lint/typecheck/test/build on every PR and push to main |
| `.github/workflows/release.yml` | Release workflow | Auto-opens "Version Packages" PR; publishes to npm on merge |
| `.github/pull_request_template.md` | PR template | Pre-fills the PR description with "What & why" + checklist |
| GitHub Actions | CI/CD platform | Runs the workflows on GitHub-hosted virtual machines |
| GitHub branch protection | Server-side rules | "No direct push to main", "CI must pass", "linear history only" |
| Repository secret (`NPM_TOKEN`) | Encrypted config | npm auth token used by the release workflow to publish |

## Further Reading

- pnpm workspaces: <https://pnpm.io/workspaces>
- Turborepo crafting your repository: <https://turborepo.com/docs/crafting-your-repository>
- Biome: <https://biomejs.dev>
- EditorConfig: <https://editorconfig.org>
- Husky: <https://typicode.github.io/husky>
- lint-staged: <https://github.com/lint-staged/lint-staged>
- Changesets: <https://github.com/changesets/changesets>
- Changesets GitHub Action: <https://github.com/changesets/action>
- Semantic Versioning: <https://semver.org>
- GitHub Actions: <https://docs.github.com/en/actions>
- GitHub branch protection rules: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches>
- GitHub Flow: <https://docs.github.com/en/get-started/using-github/github-flow>
