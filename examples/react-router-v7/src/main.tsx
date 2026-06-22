import { init } from "@watch/browser"
import { StrictMode } from "react"
import "./styles.css"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { routes } from "./app"

// Initialise the Watch SDK as early as possible. The DSN is minted against the
// local Go server — run `pnpm mint:dsn` and put the result in .env.local.
const dsn = import.meta.env.VITE_WATCH_DSN
if (dsn) {
  init({ dsn, environment: "development", release: "example-rr7@0.0.0" })
} else {
  console.warn(
    "VITE_WATCH_DSN is not set — telemetry will not be sent. Run `pnpm mint:dsn` and add it to examples/react-router-v7/.env.local",
  )
}

const router = createBrowserRouter(routes)

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("missing #root element")

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
