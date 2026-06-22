# Watch — React Router v7 example

A minimal React Router v7 (data mode) SPA wired to the Watch browser SDK. Use it
to prove the end-to-end loop: SDK → `/ingest` → Postgres `raw_events` → rollups.

## Run the loop

From the repo root:

```bash
# 1. Start Postgres + the Go server (applies migrations).
pnpm dev:all          # or: pnpm db:pg && pnpm server:dev

# 2. Mint a DSN whose allowed origin is this app's dev origin.
ALLOWED_ORIGINS=http://localhost:5173 pnpm mint:dsn

# 3. Paste the printed DSN into examples/react-router-v7/.env.local:
#    VITE_WATCH_DSN=http://localhost:8080/ingest/pk_xxxx

# 4. Start the example app.
pnpm --filter @watch/example-react-router-v7 dev
```

Open http://localhost:5173 and use the buttons (crash, handler error, failed
fetch, breadcrumb) and the nav links. Web Vitals are captured automatically.

## See the data

```bash
docker exec watch-postgres psql -U watch -d watch \
  -c "select type, context->>'route' as route, received_at from raw_events order by received_at desc limit 20;"
```

You should see `web_vital`, `frontend_error`, `network_request`, and `navigation`
rows, with `/users/:id` (the template) — not `/users/42` — for the user route.

## What it exercises (every SDK capability)

| Group | Buttons | Event |
| --- | --- | --- |
| Errors | Crash render, Throw in handler, Reject a promise | `frontend_error` (mechanisms: `error_boundary`, `onerror`, `unhandledrejection`) |
| Network | Failed fetch, Failed XHR, Redaction demo | `network_request` (fetch + XHR; sensitive query params `[redacted]`) |
| Assets | Broken image, Broken script | `asset_load` |
| Web Vitals | Cause layout shift; any click | FCP/LCP/TTFB on load; CLS via the shift; INP on interaction |
| Identity | Set user | `setUser({ idHash })` → `context.user_id_hash` (PII-free) |
| Breadcrumbs | Add breadcrumb | buffered, attached to the next error |
| Routing | nav links | `navigation` + route template `/users/:id` via `WatchRouterContext` |

### Verify in Postgres

```bash
# Event types + error mechanisms
docker exec watch-postgres psql -U watch -d watch -c \
"select event_type, count(*) from raw_events group by 1 order by 2 desc;"

# Redaction: sensitive query params must be [redacted]
docker exec watch-postgres psql -U watch -d watch -c \
"select payload->'payload'->>'url' from raw_events where event_type='network_request';"

# user_id_hash present after 'Set user'
docker exec watch-postgres psql -U watch -d watch -c \
"select payload->'context'->>'user_id_hash', count(*) from raw_events group by 1;"
```

### Notes on Web Vitals
FCP, LCP, and TTFB fire on load. **CLS** only counts layout shifts that aren't
within 500ms of a user interaction — the "Cause layout shift" button delays the
shift so it qualifies. **INP** is reported on interaction when the page is
hidden; click a few buttons, then switch tabs. (Both are `web-vitals` library
behaviors; the SDK wires all five metrics.)

### Privacy note
Default redaction covers `token`, `password`, `authorization`, `cookie`,
`api_key`, etc. Domain-specific fields (e.g. `card`, `account`, `bvn`) are **not**
redacted by default — configure project-level redact keys for those.
