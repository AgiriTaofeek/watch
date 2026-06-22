---
"@watch/browser": patch
---

Fix the SDK never sending events in real browsers. The transport snapshotted the
global `fetch` unbound, so calling it as `this._fetch(...)` threw "Illegal
invocation" (browsers require `fetch` to be called with `this === window`) and
every ingest request failed silently. The reference is now bound to `globalThis`.
This only surfaced in a real browser — jsdom's `fetch` can be called unbound,
which is why unit tests passed.
