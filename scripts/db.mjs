#!/usr/bin/env node
// db.mjs — thin CLI wrapper for DB seed / truncate / reset operations.
//
// Commands:
//   node scripts/db.mjs seed      — seed analytics data into existing project
//   node scripts/db.mjs truncate  — clear analytics data (keep org/users/projects)
//   node scripts/db.mjs reset     — truncate then seed (idempotent)
//
// The DATABASE_URL is read from the environment or .env at the repo root.
// Requires psql to be on your PATH (comes with PostgreSQL or brew install libpq).

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, "..")

// Load .env from repo root if DATABASE_URL is not already set
if (!process.env.DATABASE_URL) {
  const envFile = resolve(root, ".env")
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!(key in process.env)) process.env[key] = val
    }
  }
}

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  console.error("Error: DATABASE_URL is not set and .env was not found.")
  process.exit(1)
}

function psql(sqlFile) {
  const path = resolve(__dir, sqlFile)
  console.log(`  → psql < ${sqlFile}`)
  execSync(`psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${path}"`, {
    stdio: "inherit",
    env: process.env,
  })
}

const cmd = process.argv[2]

switch (cmd) {
  case "seed":
    console.log("Seeding database…")
    psql("seed.sql")
    console.log("Done.")
    break

  case "truncate":
    console.log("Truncating analytics data…")
    psql("truncate-data.sql")
    console.log("Done.")
    break

  case "reset":
    console.log("Resetting database (truncate → seed)…")
    psql("truncate-data.sql")
    psql("seed.sql")
    console.log("Done.")
    break

  default:
    console.error(
      `Usage: node scripts/db.mjs <seed|truncate|reset>\n\n` +
      `  seed     — insert/overwrite analytics data into existing project\n` +
      `  truncate — clear analytics data (keeps org/users/projects/envs/keys)\n` +
      `  reset    — truncate then seed (useful before each test run)\n`,
    )
    process.exit(1)
}
