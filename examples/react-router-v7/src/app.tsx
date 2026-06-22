import { addBreadcrumb, setUser } from "@watch/browser"
import { WatchErrorBoundary } from "@watch/react"
import { WatchRouterContext } from "@watch/react/router"
import { useState } from "react"
import { Link, Outlet, type RouteObject, useParams } from "react-router"

// Root layout: the error boundary captures render crashes, and WatchRouterContext
// keeps the route template (e.g. /users/:id) in sync via useMatches.
function Layout() {
  return (
    <WatchErrorBoundary
      fallback={
        <p>💥 The app crashed — Watch was notified. Reload to continue.</p>
      }
    >
      <WatchRouterContext />
      <header>
        <h1>Watch — React Router v7 example</h1>
        <nav>
          <Link to="/">Home</Link> {" · "}
          <Link to="/users/42">User 42</Link> {" · "}
          <Link to="/users/7">User 7</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </WatchErrorBoundary>
  )
}

// Throws during render so the error boundary catches it.
function Crash(): never {
  throw new Error("Boom! Render error from the example app")
}

function makeFailingXHR(url: string): void {
  const xhr = new XMLHttpRequest()
  xhr.open("GET", url)
  xhr.send()
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="group">
      <legend>{title}</legend>
      <div className="row">{children}</div>
    </fieldset>
  )
}

function Home() {
  const [crash, setCrash] = useState(false)
  const [shifted, setShifted] = useState(false)
  if (crash) return <Crash />

  return (
    <section>
      {/* A dynamically inserted tall block produces a layout shift (CLS). */}
      {shifted && (
        <div className="shift-block">
          Injected block (causes a layout shift → CLS)
        </div>
      )}

      <p>
        Click to generate every telemetry type, then inspect{" "}
        <code>raw_events</code> in Postgres. Web Vitals are captured
        automatically; click buttons to produce INP, and "layout shift" to
        produce CLS.
      </p>

      <Group title="Errors">
        <button type="button" onClick={() => setCrash(true)}>
          Crash render (error boundary)
        </button>
        <button
          type="button"
          onClick={() => {
            throw new Error("Boom! Handler error from the example app")
          }}
        >
          Throw in handler (onerror)
        </button>
        <button
          type="button"
          onClick={() => {
            // No .catch → triggers window 'unhandledrejection'.
            void Promise.reject(new Error("Boom! Unhandled promise rejection"))
          }}
        >
          Reject a promise (unhandledrejection)
        </button>
      </Group>

      <Group title="Network failures">
        <button
          type="button"
          onClick={() => {
            void fetch("http://localhost:9999/api/broken").catch(() => {})
          }}
        >
          Failed fetch
        </button>
        <button
          type="button"
          onClick={() => makeFailingXHR("http://localhost:9999/api/broken-xhr")}
        >
          Failed XHR
        </button>
        <button
          type="button"
          onClick={() => {
            // Sensitive query params must be redacted server- and client-side.
            void fetch(
              "http://localhost:9999/api/pay?token=secret123&password=hunter2&access_token=abc123",
            ).catch(() => {})
          }}
        >
          Redaction demo (sensitive query params)
        </button>
      </Group>

      <Group title="Asset failures">
        <button
          type="button"
          onClick={() => {
            const img = document.createElement("img")
            img.src = `/__missing__-${Date.now()}.png`
            document.body.appendChild(img)
          }}
        >
          Broken image
        </button>
        <button
          type="button"
          onClick={() => {
            const s = document.createElement("script")
            s.src = `/__missing__-${Date.now()}.js`
            document.body.appendChild(s)
          }}
        >
          Broken script
        </button>
      </Group>

      <Group title="Web Vitals (interaction)">
        <button
          type="button"
          // Delay the shift past 500ms so web-vitals doesn't treat it as an
          // expected (input-triggered) shift and exclude it from CLS.
          onClick={() => setTimeout(() => setShifted(true), 700)}
        >
          Cause layout shift (CLS)
        </button>
      </Group>

      <Group title="Identity & breadcrumbs">
        <button
          type="button"
          onClick={() => setUser({ idHash: "hash-of-user-123" })}
        >
          Set user (pseudonymous hash)
        </button>
        <button
          type="button"
          onClick={() =>
            addBreadcrumb({ type: "manual", message: "example_button_clicked" })
          }
        >
          Add breadcrumb
        </button>
      </Group>
    </section>
  )
}

function User() {
  const { id } = useParams()
  return (
    <section>
      <h2>User {id}</h2>
      <p>
        Watch should record this route as the template <code>/users/:id</code>,
        not the raw URL.
      </p>
    </section>
  )
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "users/:id", element: <User /> },
    ],
  },
]
