import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Dev server runs on 5173 — mint the DSN with this as the allowed origin:
//   ALLOWED_ORIGINS=http://localhost:5173 pnpm mint:dsn
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
