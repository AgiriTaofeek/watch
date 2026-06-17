# @watch/browser

Privacy-first browser SDK for the [Watch](https://github.com/AgiriTaofeek/watch) self-hosted frontend monitoring system.

Watch collects Web Vitals, JavaScript errors, asset/chunk load failures, navigation timing, and privacy-safe breadcrumbs — and sends them to a self-hosted Watch ingestion endpoint inside your own infrastructure. The SDK is framework-agnostic at its core, with optional integrations for React, React Router v7, and other stacks.

> **Status:** pre-1.0, under active development. Real implementation lands in Milestone 2 (see [docs/roadmap.md](https://github.com/AgiriTaofeek/watch/blob/main/docs/roadmap.md)).

## Install

```bash
npm install @watch/browser
# or
pnpm add @watch/browser
# or
yarn add @watch/browser
```

## Usage

```ts
import { init } from "@watch/browser"

init({
  dsn: "https://watch.company.com/ingest/pk_abc123",
  environment: "production",
  release: "customer-portal@2026.05.28",
})
```

The DSN is the project- and environment-scoped ingestion key you create in the Watch dashboard. It is safe to embed in frontend code; it does not grant dashboard access.

## What it collects (v1)

- Web Vitals: `LCP`, `CLS`, `INP`, `FCP`, `TTFB`
- JavaScript errors and unhandled promise rejections
- Failed `fetch` and `XMLHttpRequest` calls
- Asset and chunk load failures
- Page and client-side navigation timing
- Privacy-safe breadcrumbs attached to errors
- Release and environment metadata

## What it does NOT collect by default

- Cookies, local/session storage values
- Form field values
- Request or response bodies
- DOM snapshots or screen recordings
- Card data, account numbers, transaction identifiers, passwords, tokens

See [docs/security-privacy.md](https://github.com/AgiriTaofeek/watch/blob/main/docs/security-privacy.md) for the full privacy posture and the test suite that enforces it.

## Optional integrations

Available as separate exports once Milestone 4 lands:

- React error boundary
- React Router v7 route context

## Compatibility

Works with plain HTML/JS, traditional multi-page apps, server-rendered apps, static sites, and SPAs built with React, Vue, Angular, Svelte, or any other framework.

## License

UNLICENSED — pre-publish. License will be set before the first npm release.
