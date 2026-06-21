import { paraglideVitePlugin } from "@inlang/paraglide-js"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

// The browser only ever talks to this Start (Nitro) server. Dashboard data
// flows through server functions that reach the Go API server-side via
// INTERNAL_API_URL, so no browser→Go dev proxy is needed.

// Security headers applied to every dashboard response via Nitro routeRules.
// Kept here (not src/start.ts) so TanStack Start's auto-installed CSRF middleware
// for server functions is not displaced.
// HSTS is honored only over HTTPS (ignored on plain-HTTP dev). A Content-Security-
// Policy is intentionally omitted: the app emits an inline theme script and inline
// hydration scripts, so a strict CSP needs nonce/hash plumbing — tracked as a
// follow-up; until then, set CSP at the reverse proxy (see docs/security-hardening.md).
const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["url", "baseLocale"],
    }),
    nitro({
      routeRules: { "/**": { headers: securityHeaders } },
      rollupConfig: { external: [/^@sentry\//] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
