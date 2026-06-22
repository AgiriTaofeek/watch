/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WATCH_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
