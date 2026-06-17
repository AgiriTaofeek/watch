import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/router.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react-router"],
})
