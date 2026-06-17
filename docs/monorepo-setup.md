# Monorepo Bootstrap

## Context

The repo currently contains only `README.md` and `/docs`. The architecture doc commits to a polyglot monorepo: a Go service at `apps/server`, a TanStack Start dashboard at `apps/dashboard`, and a TypeScript browser SDK at `packages/browser`. This plan scaffolds that layout end-to-end so Milestone 1 (Go ingestion spine) and Milestone 2 (browser SDK core) can be developed against working build/test/lint commands from day one.

Tooling decisions (locked in with user):

- **JS package manager + task runner**: pnpm workspaces + Turborepo
- **TS lint/format**: Biome (single root config)
- **Browser SDK bundler**: tsup (ESM + CJS + `.d.ts`)
- **Shared TS types**: `packages/contracts` (consumed by SDK; eventually by dashboard)
- **Go**: single `go.mod` inside `apps/server` (no `go.work`)
- **Dashboard scaffolding**: deferred to Milestone 6 — only a `.gitkeep` reserves the directory
- **Root extras**: `.editorconfig`, `.nvmrc` pinning Node 22, Husky + lint-staged, Changesets
- **Test runner (TS)**: Vitest (chosen by default; pairs with Biome + Vite ecosystem)

Versions confirmed locally: Node 22.20.0, pnpm 10.19.0, Go 1.25.4.

Couldn't reach `turborepo.dev` / `go.dev/blog` / `go.dev/ref/mod` from the sandbox — Turborepo and Go workspace details below come from established patterns and the Go modules reference (golang-standards/project-layout was reachable). The plan still calls out exact files and commands so verification is unambiguous.

**Before executing**, settle two open values:

- **Go module import path**: every snippet uses the placeholder `github.com/<owner>/watch/apps/server`. Replace `<owner>` with the actual GitHub org/user before `go.mod` is written.
- **Biome version**: `^1.9.4` is the late-2024 stable. Biome 2.x shipped in 2025 with config-format changes; check the current `@biomejs/biome` release on npm and bump the version (and `$schema` URL in `biome.json`) before running `pnpm install`.

## Step 1 — Repo-wide bootstrap

### `git init`

Run `git init` at `/Users/tolani/Desktop/watch` (the repo is not yet a git repo).

### `.gitignore` (root)

```
# Node
node_modules/
*.log
.pnpm-store/
.turbo/
dist/
coverage/

# Go
apps/server/bin/
apps/server/tmp/
*.test
*.out

# Editors/OS
.DS_Store
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json

# Env
.env
.env.*
!.env.example
```

### `.editorconfig` (root)

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.go]
indent_style = tab

[*.md]
trim_trailing_whitespace = false
```

### `.nvmrc` (root)

```
22
```

### `LICENSE` (root)

Skip for now unless the user requests one — out of scope for monorepo setup.

## Step 2 — Root pnpm workspace + Turborepo + Biome

### `pnpm-workspace.yaml` (root)

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `package.json` (root)

```json
{
  "name": "watch",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@10.19.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "biome check . && turbo run lint",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "turbo run typecheck",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "turbo run build && changeset publish",
    "prepare": "husky"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@changesets/cli": "^2.27.10",
    "husky": "^9.1.7",
    "lint-staged": "^15.2.10",
    "turbo": "^2.3.3",
    "typescript": "^5.6.3"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

Install command after writing the file:

```bash
pnpm install
```

### `turbo.json` (root)

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "globalDependencies": [
    "tsconfig.base.json",
    ".nvmrc",
    "biome.json",
    ".editorconfig"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

Notes:

- `^build` means a package's `build` runs after its workspace dependencies' `build`.
- `persistent: true` marks `dev` as a long-running task so Turborepo doesn't try to cache it.
- `globalDependencies` lists files whose changes invalidate every package's cache. Editing the shared tsconfig, Biome config, Node version, or EditorConfig forces clean rebuilds across the workspace.
- Per-package overrides (e.g. Go inputs/outputs for `apps/server`) live in a per-package `turbo.json` — see Step 5.

### `biome.json` (root)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "ignore": ["**/dist", "**/.turbo", "**/coverage"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "asNeeded" }
  }
}
```

### `tsconfig.base.json` (root)

Shared base extended by every TS package.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### Husky pre-commit hook

Husky 9 dropped the prepare-script auto-bootstrap, so the `"prepare": "husky"` line in `package.json` only runs Husky after `.husky/` has been initialised. Do the init explicitly, then add the hook.

```bash
pnpm install              # installs husky (no-op for .husky/ on first run)
pnpm exec husky init      # creates .husky/ skeleton + a default .husky/pre-commit
```

Then overwrite `.husky/pre-commit` with:

```sh
pnpm exec lint-staged
```

Ensure it is executable (Husky 9 invokes it via `sh` regardless, but the convention is `+x` and a future Husky may enforce it):

```bash
chmod +x .husky/pre-commit
```

### Changesets init

```bash
pnpm exec changeset init
```

This creates `.changeset/config.json` and `.changeset/README.md`. Edit `.changeset/config.json` to set `"access": "public"` once the SDK is ready to publish; leave as `"restricted"` for now.

## Step 3 — `packages/contracts` (shared TS types)

Pure-types package. Consumed by the browser SDK and (later) by the dashboard.

### `packages/contracts/package.json`

```json
{
  "name": "@watch/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --emitDeclarationOnly --outDir dist",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

### `packages/contracts/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

### `packages/contracts/src/index.ts`

Initial stub mirroring the event envelope from [docs/event-taxonomy.md](docs/event-taxonomy.md):

```ts
export type EventType =
  | "web_vital"
  | "frontend_error"
  | "network_request"
  | "navigation"
  | "asset_load"
  | "breadcrumb"
  | "deployment";

export interface EventEnvelope<T = unknown> {
  environment: string;
  release?: string;
  service: "frontend";
  timestamp: string;
  type: EventType;
  context: {
    route?: string;
    user_id_hash?: string;
    session_id?: string;
  };
  payload: T;
}
```

Real payload types per event fill in during M2.

## Step 4 — `packages/browser` (browser SDK)

Per [docs/roadmap.md](docs/roadmap.md) Milestone 2.

### `packages/browser/package.json`

```json
{
  "name": "@watch/browser",
  "version": "0.0.0",
  "description": "Privacy-first browser SDK for the Watch self-hosted frontend monitor",
  "author": "<your-name-or-org>",
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/watch.git",
    "directory": "packages/browser"
  },
  "homepage": "https://github.com/<owner>/watch/tree/main/packages/browser#readme",
  "bugs": { "url": "https://github.com/<owner>/watch/issues" },
  "keywords": [
    "frontend-monitoring",
    "web-vitals",
    "browser-sdk",
    "self-hosted",
    "privacy-first",
    "observability",
    "error-tracking",
    "watch"
  ],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@watch/contracts": "workspace:*"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.1.8",
    "jsdom": "^29.1.1",
    "tsup": "^8.3.5",
    "vitest": "^2.1.8"
  }
}
```

The `author`/`repository`/`homepage`/`bugs`/`keywords` fields are publish-ready scaffolding — npm will warn about their absence when you eventually run `pnpm changeset publish`. The `license` field is deliberately omitted until a LICENSE file is added; declaring a license in the manifest without the file is misleading.

### `packages/browser/tsup.config.ts`

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
```

### `packages/browser/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

### `packages/browser/src/index.ts`

Minimal `init` stub so the build succeeds. Real implementation lands in M2.

```ts
import type { EventEnvelope } from "@watch/contracts";

export interface InitOptions {
  dsn: string;
  environment?: string;
  release?: string;
}

export function init(_options: InitOptions): void {
  // M2 implementation
}

export type { EventEnvelope };
```

### `packages/browser/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
})
```

Install `jsdom` and the v8 coverage provider at bootstrap time. Vitest evaluates the config (and thus tries to load the `jsdom` environment) before `--passWithNoTests` can take effect, and `--coverage` will fail without the matching provider — both must exist before any test files are written.

```bash
pnpm --filter @watch/browser add -D jsdom "@vitest/coverage-v8@^2.1.8"
```

Pin `@vitest/coverage-v8` to the same major as `vitest` — installing without a version qualifier picks the latest (currently `4.x`) which peer-warns against `vitest@2.x`.

### `packages/browser/README.md`

npm publish warns if a published package has no README. Create one now so the package is publish-ready when `private: true` is flipped off later. The README should cover: what the SDK is, install (`npm/pnpm/yarn install @watch/browser`), a minimal `init()` usage example, what is and is not collected by default, and a pointer back to the main repository.

## Step 5 — `apps/server` (Go service)

Per [docs/roadmap.md](docs/roadmap.md) Milestone 1. Single `go.mod`, standard layout, one binary `watch` containing ingestion + dashboard API + worker + alerts.

### `apps/server/go.mod`

```
module github.com/<owner>/watch/apps/server

go 1.25
```

Replace `<owner>` with the actual GitHub org/user once the user confirms the import path.

### `apps/server/cmd/watch/main.go`

```go
package main

import (
    "context"
    "log/slog"
    "os"
    "os/signal"
    "syscall"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    logger.Info("watch starting")
    <-ctx.Done()
    logger.Info("watch shutting down")
}
```

### `apps/server/internal/` layout

Create empty packages with placeholder `doc.go` files so Go treats them as packages:

```
apps/server/internal/api/doc.go       // Package api hosts HTTP handlers (ingestion + dashboard).
apps/server/internal/worker/doc.go    // Package worker hosts background processors.
apps/server/internal/alerts/doc.go    // Package alerts hosts alert evaluation and delivery.
apps/server/internal/store/doc.go     // Package store hosts Postgres access.
apps/server/internal/config/doc.go    // Package config loads runtime configuration.
```

Each `doc.go` is one line: `package <name>`.

### `apps/server/package.json`

Tiny shim so Turborepo can run the Go build via pnpm.

```json
{
  "name": "@watch/server",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "go build -o bin/watch ./cmd/watch",
    "dev": "air",
    "test": "go test ./...",
    "typecheck": "go vet ./...",
    "lint": "golangci-lint run ./..."
  }
}
```

This lets `pnpm build` from the root drive the Go build via Turborepo's task graph. The Go module is independent — `go build ./...` from `apps/server` keeps working regardless of pnpm.

The `dev` script uses [`air`](https://github.com/air-verse/air) for live-reload. Install it once globally:

```bash
go install github.com/air-verse/air@latest
```

`air` reads `apps/server/.air.toml` (next subsection) to know what to watch and rebuild.

### `apps/server/.air.toml` (live-reload config)

```toml
root = "."
tmp_dir = "tmp"

[build]
cmd = "go build -o ./tmp/watch ./cmd/watch"
bin = "tmp/watch"
include_ext = ["go"]
exclude_dir = ["bin", "tmp", "node_modules"]
delay = 200
```

The `tmp/` and `bin/` directories are already in `.gitignore` (Step 1).

### `apps/server/turbo.json` (per-package override)

Tells Turborepo what Go source files invalidate the `build` cache and where the binary lands, so a second `pnpm build` is a true `FULL TURBO` hit when no Go code changed.

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "inputs": [
        "cmd/**/*.go",
        "internal/**/*.go",
        "pkg/**/*.go",
        "go.mod",
        "go.sum"
      ],
      "outputs": ["bin/**"]
    },
    "test": {
      "inputs": [
        "cmd/**/*.go",
        "internal/**/*.go",
        "pkg/**/*.go",
        "go.mod",
        "go.sum"
      ],
      "outputs": []
    },
    "lint": {
      "inputs": [
        "cmd/**/*.go",
        "internal/**/*.go",
        "pkg/**/*.go",
        ".golangci.yml"
      ]
    }
  }
}
```

## Step 6 — `apps/dashboard` (placeholder)

Per the locked-in decision, dashboard scaffolding is deferred to Milestone 6.

Create:

- `apps/dashboard/.gitkeep`
- `apps/dashboard/README.md` with one line: `TanStack Start dashboard. Scaffold during Milestone 6 with \`npx @tanstack/cli@latest create\`.`

No `package.json` yet — pnpm workspaces won't choke on an empty directory if there's no manifest, and Turborepo only runs against packages that exist.

## Step 7 — `/deploy` (placeholder)

Create:

- `deploy/.gitkeep`
- `deploy/README.md` with one line: `Docker Compose and env examples. Compose file lands in Milestone 1.`

## Step 8 — Initial commit

```bash
git add -A
git commit -m "Bootstrap monorepo (pnpm + Turborepo + Biome + Go service skeleton)"
```

Don't push yet — wait for the user to confirm the remote/owner for the Go module path.

## Step 9 — CI workflow

Without CI, all the wired-up task graph only runs on a laptop. The minimum is a single GitHub Actions workflow that mirrors `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: apps/server/go.sum

      - name: Install golangci-lint
        # Must be built with a Go toolchain >= go.mod's go version, otherwise
        # the lint step fails with "the Go language version (goX.Y) used to
        # build golangci-lint is lower than the targeted Go version".
        run: |
          curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh \
            | sh -s -- -b "$(go env GOPATH)/bin" v2.12.2

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Notes:

- `pnpm/action-setup@v4` is called without `with: version: ...` so it picks up `packageManager` from the root `package.json`. Single source of truth.
- `concurrency` cancels superseded runs on the same PR while preserving full runs on `main`.
- `permissions: contents: read` restricts the workflow token to the minimum needed. Tighten further later if any step needs more.
- The `Install golangci-lint` step is required because `pnpm lint` chains `turbo run lint` which calls `golangci-lint run ./...` inside `apps/server`. Without this step, CI would fail in `pnpm lint`.
- Pin a specific golangci-lint version (here `v2.12.2`). Using `HEAD` would track upstream main and break unexpectedly. **Important**: the pinned version must be built with a Go toolchain >= the version in `apps/server/go.mod`. Bumping `go.mod` from `go 1.25` to `go 1.26` may require bumping golangci-lint at the same time.
- Add Turborepo remote cache later (`TURBO_TOKEN`, `TURBO_TEAM` secrets) if rebuild times become a problem; not needed at this stage.

## Step 10 — golangci-lint

`go vet` and `gofmt` are the floor; golangci-lint is the standard for Go services.

### `apps/server/.golangci.yml`

```yaml
version: "2"

run:
  timeout: 5m

linters:
  default: none
  enable:
    - errcheck
    - govet
    - staticcheck
    - unused
    - ineffassign

formatters:
  enable:
    - gofmt
    - goimports
  settings:
    goimports:
      local-prefixes:
        - github.com/<owner>/watch
```

This is the **golangci-lint v2 configuration format**. The v1 format (no top-level `version`, `linters.disable-all: true`, `linters-settings:` block) was deprecated in 2025 and v2.x binaries reject v1 configs with `unsupported version of the configuration: ""`. `gosimple` was merged into `staticcheck` in v2 — enabling `staticcheck` covers both.

Install locally via `brew install golangci-lint` (macOS) or the official install script. CI installs it via the `Install golangci-lint` step in Step 9. CI's `pnpm lint` will trigger `golangci-lint run ./...` via the `apps/server/package.json` lint script defined in Step 5 → Turbo → per-package lint script.

## Step 11 — `.gitattributes`

Enforces LF line endings across platforms and gives GitHub correct language stats for a polyglot repo.

### `.gitattributes` (root)

```
* text=auto eol=lf

*.go linguist-language=Go
*.go text eol=lf

# Treat docs as documentation in language stats
docs/* linguist-documentation

# Binary files
*.png binary
*.jpg binary
*.ico binary

# Lockfiles should not be diffed by default in code review tools
pnpm-lock.yaml linguist-generated=true
apps/server/go.sum linguist-generated=true
```

## Step 12 — VSCode workspace settings

Day-one consistent formatting + Go tooling defaults.

### `.vscode/settings.json`

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[json]": { "editor.defaultFormatter": "biomejs.biome" },
  "[jsonc]": { "editor.defaultFormatter": "biomejs.biome" },
  "[go]": {
    "editor.defaultFormatter": "golang.go",
    "editor.codeActionsOnSave": { "source.organizeImports": "explicit" }
  },
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",
  "files.insertFinalNewline": true,
  "files.trimTrailingWhitespace": true
}
```

### `.vscode/extensions.json`

```json
{
  "recommendations": ["biomejs.biome", "golang.go", "editorconfig.editorconfig"]
}
```

## Step 13 — `.env.example`

Signals the env convention. Real `.env` files stay gitignored (per Step 1) but `.env.example` is committed so contributors know what to set.

### `.env.example` (root)

```dotenv
# Postgres connection string used by apps/server
DATABASE_URL=postgres://watch:watch@localhost:5432/watch?sslmode=disable

# Dashboard auth mode: local | oidc | trusted_header (see docs/auth-model.md)
WATCH_AUTH_MODE=local

# HTTP listen address for the Go server
WATCH_LISTEN_ADDR=:8080

# Log level: debug | info | warn | error
WATCH_LOG_LEVEL=info
```

Add OIDC and trusted-header variables when those modes are implemented; v1 only needs the local-auth defaults.

## Optional polish

Pick from this list as needed. None of these are required for the monorepo to be usable, but each pays back over time.

### Dependabot

`.github/dependabot.yml` keeps deps fresh with weekly PRs.

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: gomod
    directory: "/apps/server"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
```

### `CONTRIBUTING.md`

A root-level onboarding doc for new contributors. See the committed [CONTRIBUTING.md](../CONTRIBUTING.md) for the actual content — it covers:

- Prerequisites (Node 22, pnpm, Go 1.25, golangci-lint).
- First-time setup (`git clone` → `nvm use` → `pnpm install` → `cp .env.example .env`).
- Repository layout — what lives in `apps/*` vs `packages/*`.
- Daily commands at the root (`pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, etc.).
- Targeting a single package with `--filter` (e.g. `pnpm --filter @watch/browser test`).
- Which milestone work happens where, linked to [roadmap.md](roadmap.md).
- Code style enforcement (Biome auto-formats; pre-commit hook handles staged files).
- Adding a changeset via `pnpm changeset` before merging.
- The pre-push checklist that mirrors CI.
- Pointers to deeper docs in `/docs`.

### pnpm catalogs

Avoid version drift between packages. In `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  typescript: ^5.6.3
  vitest: ^2.1.8
  tsup: ^8.3.5
```

Then in each package's `package.json`, reference `"typescript": "catalog:"`, `"vitest": "catalog:"`, etc.

### `CODEOWNERS`

Only meaningful with more than one contributor. Skip if solo.

### `SECURITY.md` + npm scope reservation

If the SDK will eventually be published as `@watch/browser`, reserve the `@watch` npm scope before someone else does (`npm org create watch` or claim via the npm website). Add a `SECURITY.md` with a contact email once Watch is internet-reachable; not needed for a private repo.

## Critical files created/modified

Root: `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `tsconfig.base.json`, `.husky/pre-commit`, `.changeset/config.json`

CI / editor:

- `.github/workflows/ci.yml`
- `.vscode/{settings.json, extensions.json}`

Packages:

- `packages/contracts/{package.json, tsconfig.json, src/index.ts}`
- `packages/browser/{package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, src/index.ts, README.md}`

Apps:

- `apps/server/{go.mod, package.json, turbo.json, .golangci.yml, .air.toml, cmd/watch/main.go, internal/**/doc.go}`
- `apps/dashboard/{.gitkeep, README.md}`

Deploy:

- `deploy/{.gitkeep, README.md}`

Optional (add as needed): `.github/dependabot.yml`, `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`, `LICENSE`.

## Verification

After Step 8, run from the repo root and confirm each succeeds:

1. **Workspace discovery**: `pnpm -r ls --depth -1` lists `@watch/contracts`, `@watch/browser`, and `@watch/server`.
2. **TS build**: `pnpm build` runs Turborepo and:
   - builds `@watch/contracts` first (tsc emits `.d.ts` into `packages/contracts/dist`)
   - then builds `@watch/browser` (tsup emits ESM + CJS + `.d.ts` into `packages/browser/dist`)
   - then builds `@watch/server` (`go build` produces `apps/server/bin/watch`).
3. **Lint**: `pnpm lint` runs Biome on TS/JSON and then `turbo run lint` invokes `golangci-lint run ./...` inside `apps/server`. Both should report 0 issues.
4. **Typecheck**: `pnpm typecheck` runs `tsc --noEmit` in TS packages and `go vet ./...` in server.
5. **Tests**: `pnpm test` succeeds (no tests yet; Vitest exits 0 thanks to `--passWithNoTests`, `go test` reports `?` per package).
6. **Go binary runs**: from `apps/server`, `go run ./cmd/watch` starts, logs "watch starting", and exits cleanly on Ctrl-C.
7. **Pre-commit hook**: stage a file with bad formatting, attempt a commit; Husky + lint-staged should rewrite it via Biome.
8. **Changesets ready**: `pnpm changeset --empty` succeeds (proves config is valid).
9. **Cache hit**: `pnpm build` a second time — Turborepo should report `FULL TURBO` cache hits for every package, including `@watch/server` (the per-package `apps/server/turbo.json` from Step 5 declares the Go inputs/outputs).
10. **Go lint (v2)**: from `apps/server`, `golangci-lint run ./...` exits `0 issues.` against the placeholder packages. If you see `unsupported version of the configuration: ""`, the `.golangci.yml` is still in v1 format — confirm `version: "2"` is the first line.
11. **Coverage works**: `pnpm --filter @watch/browser exec vitest run --coverage --passWithNoTests` completes without a `MISSING DEPENDENCY` prompt and emits a coverage table.
12. **CI green**: push a branch and open a draft PR; `.github/workflows/ci.yml` runs lint + typecheck + test + build successfully on GitHub, including the golangci-lint install step.
13. **Concurrency / permissions**: open a second commit on the same PR while the first run is in progress — the older run gets cancelled (`concurrency.cancel-in-progress`).
14. **VSCode formatting**: open a TS file with bad formatting in VSCode (with the recommended extensions installed) and save — Biome rewrites it.
15. **Env example**: `.env.example` is committed; `.env` is gitignored. `cp .env.example .env` works for local dev.
16. **Hook executable**: `ls -la .husky/pre-commit` shows the executable bit (`-rwxr-xr-x`).
17. **Go live-reload**: `pnpm --filter @watch/server dev` starts `air`, which rebuilds and reruns `watch` on every `.go` save in `apps/server/`.

If all 17 pass, the monorepo is ready for Milestone 1 implementation work to begin in `apps/server` and Milestone 2 in `packages/browser`.
