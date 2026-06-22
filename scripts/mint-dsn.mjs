#!/usr/bin/env node
// Mint a Watch ingestion DSN for local development.
//
// Talks directly to the Go Dashboard API (not the dashboard BFF): ensures an owner
// exists (setup is idempotent — 409 if already done), logs in, creates a project
// with the given allowed origins, and prints the ready-to-paste DSN.
//
// Usage:
//   node scripts/mint-dsn.mjs
//   ALLOWED_ORIGINS=http://localhost:5173 PROJECT_NAME="RR7 example" node scripts/mint-dsn.mjs
//
// Env:
//   API_URL          default http://localhost:8080
//   EMAIL/PASSWORD   default admin@watch.local / watch-dev-password
//   PROJECT_NAME     default "Example app"
//   ALLOWED_ORIGINS  comma-separated; default http://localhost:5173

const API = process.env.API_URL ?? "http://localhost:8080"
const email = process.env.EMAIL ?? "admin@watch.local"
const password = process.env.PASSWORD ?? "watch-dev-password"
const projectName = process.env.PROJECT_NAME ?? "Example app"
const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const jar = {}

function storeCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";", 1)[0]
    const i = pair.indexOf("=")
    if (i > 0) jar[pair.slice(0, i)] = pair.slice(i + 1)
  }
}
const cookieHeader = () =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")

function fail(msg, res, body) {
  console.error(`✖ ${msg}${res ? ` (HTTP ${res.status})` : ""}`)
  if (body) console.error(body)
  process.exit(1)
}

// 1. Ensure an owner exists (idempotent: 409 = already set up).
let res = await fetch(`${API}/auth/setup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
}).catch((e) => fail(`cannot reach ${API} — is the Go server running?\n${e}`))
if (res.status !== 201 && res.status !== 409) {
  fail("setup failed", res, await res.text())
}

// 2. Log in to get the session + CSRF cookies.
res = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
})
if (!res.ok) fail("login failed", res, await res.text())
storeCookies(res)
const csrf = jar.watch_csrf
if (!csrf) fail("login did not set a watch_csrf cookie")

// 3. Create a project (auto-creates a 'production' environment + ingestion key).
res = await fetch(`${API}/api/projects`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: cookieHeader(),
    "x-csrf-token": csrf,
  },
  body: JSON.stringify({ name: projectName, allowed_origins: origins }),
})
if (!res.ok) fail("create project failed", res, await res.text())
const project = await res.json()
const key = project?.environments?.[0]?.keys?.[0]?.public_key
if (!key) fail("no ingestion key in project response", null, JSON.stringify(project))

const dsn = `${API}/ingest/${key}`
console.log(`\n✓ Project "${project.name}" (${project.id})`)
console.log(`  Allowed origins: ${origins.join(", ")}`)
console.log(`\nDSN:\n  ${dsn}`)
console.log(`\nUse it in the example app (examples/react-router-v7/.env.local):`)
console.log(`  VITE_WATCH_DSN=${dsn}\n`)
