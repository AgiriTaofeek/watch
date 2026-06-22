import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/router.tsx", "src/router-v5.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react-router", "react-router-dom"],
})
