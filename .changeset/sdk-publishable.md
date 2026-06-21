---
"@watch/browser": patch
---

Make the browser SDK publishable: inline the internal, type-only `@watch/contracts`
package into the emitted declarations (tsup `noExternal`) and move it to
`devDependencies`, so the published package no longer depends on a private
workspace package.
