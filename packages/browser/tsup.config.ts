import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // @watch/contracts is an internal, type-only, private workspace package.
  // dts.resolve inlines its types into the emitted declarations so the published
  // package carries no dependency on an unpublished workspace package.
  dts: { resolve: ["@watch/contracts"] },
  sourcemap: true,
  clean: true,
  target: "es2022",
  noExternal: ["@watch/contracts"],
})
