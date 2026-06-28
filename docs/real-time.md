# Real-time Communication in Watch

Watch uses a BFF (Backend for Frontend) architecture where the TanStack Start
server (Nitro/h3) is the only public-facing process. The Go API is internal.
Real-time features must therefore flow through two hops:

```
Browser  ←── SSE or WebSocket ───  TanStack Start (Nitro)  ←── HTTP / SSE ───  Go API
```

Both SSE and WebSocket are supported by h3 (the HTTP framework inside Nitro)
and are available today with the packages already installed in the project.

---

## SSE (Server-Sent Events)

### When to use

- One-directional push from server to browser: live issue feed, alert ticker,
  metric updates, worker heartbeat
- Browser needs to receive a stream of discrete named events
- Simplest implementation; browser `EventSource` reconnects automatically

### h3 API

```typescript
import { createEventStream, defineEventHandler, getRouterParam, getCookie } from "h3"

// apps/dashboard/app/api/events/$projectId.ts
export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId")
  const session   = getCookie(event, "session") ?? ""

  // Open a long-lived connection to the Go API's SSE endpoint
  const goRes = await fetch(
    `${process.env.GO_API_URL}/api/projects/${projectId}/events`,
    { headers: { Cookie: `session=${session}` } }
  )

  const stream = createEventStream(event)
  const reader = goRes.body!.getReader()
  const dec    = new TextDecoder()

  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await stream.push(dec.decode(value))
      }
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})
```

`createEventStream` sets `Content-Type: text/event-stream`,
`Cache-Control: no-store`, and `X-Accel-Buffering: no` automatically.

### EventStream API surface

| Method | Purpose |
|---|---|
| `stream.push(msg)` | Send a string, `{ id, event, data }` object, or array of either |
| `stream.pushComment(text)` | Send an SSE comment line (`: text`) — useful as a keepalive ping |
| `stream.flush()` | Force queued data to the network immediately |
| `stream.close()` | Close the stream and end the response |
| `stream.onClosed(cb)` | Register a cleanup callback when the client disconnects |
| `stream.send()` | Return the readable stream — **must be the handler's return value** |

### Browser usage

```typescript
const es = new EventSource(`/api/events/${projectId}`)
es.onmessage = (e) => console.log(e.data)
es.addEventListener("issue", (e) => { /* typed event */ })
es.onerror = () => { /* EventSource reconnects automatically */ }
```

### Go side requirements

The Go API needs an SSE endpoint that:

1. Sets `Content-Type: text/event-stream` and `Cache-Control: no-store`
2. Calls `w.(http.Flusher).Flush()` after each write — the `responseRecorder`
   in `api/middleware.go` already forwards `Flush()` correctly via
   `http.NewResponseController`, so no middleware changes are needed
3. Respects `r.Context()` cancellation so connections are cleaned up when
   the BFF disconnects

```go
// Example Go SSE handler skeleton
func (a *API) handleProjectEvents(w http.ResponseWriter, r *http.Request) {
    projectID := r.PathValue("id")
    ctx := r.Context()

    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-store")
    w.Header().Set("X-Accel-Buffering", "no")

    rc := http.NewResponseController(w)

    for {
        select {
        case <-ctx.Done():
            return
        case evt := <-hub.Subscribe(projectID): // in-process pub/sub hub
            fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, evt.JSON)
            rc.Flush()
        }
    }
}
```

An in-process pub/sub hub (a `sync.Map` of channels, one per project) is the
simplest fan-out mechanism at single-instance scale. See the Known Constraints
section of [architecture.md](architecture.md) for the multi-instance caveat.

---

## WebSocket

### When to use

- Bidirectional communication: browser sends filter changes, server pushes
  filtered results without a new HTTP request
- Low-latency two-way interaction: live collaborative triage, presence indicators
- When `EventSource`'s unidirectional model is not sufficient

### h3 API

```typescript
import { defineWebSocketHandler } from "h3"

// apps/dashboard/app/api/ws/$projectId.ts
export default defineWebSocketHandler({
  open(peer) {
    // peer.ctx.node.req has the raw Node IncomingMessage for cookie access
    peer.send(JSON.stringify({ type: "connected" }))
  },

  message(peer, msg) {
    const data = JSON.parse(msg.text())
    // e.g. subscribe to a project, update a filter
    peer.send(JSON.stringify({ type: "ack", id: data.id }))
  },

  close(peer) {
    // clean up subscriptions
  },

  error(peer, err) {
    console.error("ws error", err)
  },
})
```

h3 uses [crossws](https://crossws.unjs.io) as the underlying adapter, which
handles the WebSocket upgrade across Node, Bun, and Deno runtimes.

### JSON-RPC over WebSocket

For structured method dispatch h3 also provides `defineJsonRpcWebSocketHandler`:

```typescript
import { defineJsonRpcWebSocketHandler } from "h3"

export default defineJsonRpcWebSocketHandler({
  methods: {
    subscribe:   ({ params }, peer) => { /* add peer to project channel */ },
    unsubscribe: ({ params }, peer) => { /* remove peer */ },
  },
})
```

### Go side requirements

If the Go API needs to hold WebSocket connections (rather than leaving that
entirely in the BFF), add `nhooyr.io/websocket` — it integrates cleanly with
`net/http` and `context.Context`:

```bash
go get nhooyr.io/websocket
```

For most Watch use cases the simpler architecture is:

- Go API keeps standard REST + SSE endpoints (stateless from Go's perspective)
- BFF holds the WebSocket connections and fans out Go SSE events to connected peers
- This avoids WebSocket state in the Go process and keeps the Go API horizontally scalable

---

## Choosing between SSE and WebSocket

| Factor | SSE | WebSocket |
|---|---|---|
| Direction | Server → browser only | Bidirectional |
| Browser reconnect | Automatic (`EventSource`) | Must implement manually |
| Proxy / CDN compatibility | Works through most HTTP proxies | Requires proxy upgrade support |
| Complexity | Low | Medium |
| Go API changes needed | SSE endpoint + Flush | WebSocket handler or stay REST |
| Best fit in Watch | Issue feed, alert ticker, metric push | Live filter changes, presence |

Start with SSE. Add WebSocket only when the browser needs to send data at
streaming frequency — occasional filter changes or status updates are better
served by a regular `fetch` POST alongside an SSE subscription.

---

## File placement in the monorepo

Nitro picks up raw h3 handlers from `app/api/` inside the dashboard package.
These are separate from TanStack Start's file-based page routes and from
`createServerFn` server functions, which cannot return streaming responses.

```
apps/dashboard/
  app/
    api/                        ← Nitro raw handlers (SSE + WS live here)
      events/
        $projectId.ts           ← GET /api/events/:projectId  (SSE)
      ws/
        $projectId.ts           ← GET /api/ws/:projectId      (WebSocket upgrade)
    routes/                     ← TanStack Start page routes (no streaming)
```

> **Note:** `createServerFn()` serialises responses through an RPC envelope and
> cannot return a streaming response. Always use `defineEventHandler` or
> `defineWebSocketHandler` for real-time endpoints.

---

## Related docs

- [architecture.md](architecture.md) — real-time data delay constraint and resolution path
- [request-lifecycle.md](request-lifecycle.md) — how a normal BFF request flows
- [go-architecture.md](go-architecture.md) — `http.NewResponseController` and `Flush()` forwarding
- [security-hardening.md](security-hardening.md) — ensure SSE/WS endpoints apply session validation
