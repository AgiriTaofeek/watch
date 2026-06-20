import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Intentionally excludes the TanStack Start, Nitro, and Paraglide plugins from
// vite.config.ts. Those plugins configure Vite for SSR and cause CJS packages
// (React) to fail with "module is not defined" in Vitest's ESM evaluator.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
})
