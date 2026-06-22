// Builds the public DSN a developer pastes into the browser SDK. The DSN points
// at the public ingestion endpoint where browsers POST events — NOT the BFF.
//
// In the same-origin production deployment the ingest endpoint lives at
// `<origin>/ingest`, so the current origin is the right default. For split-host
// dev (Go on :8080, dashboard on :3000) set VITE_PUBLIC_INGEST_BASE.
export function dsnFor(publicKey: string): string {
  const base =
    import.meta.env.VITE_PUBLIC_INGEST_BASE ??
    (typeof window !== "undefined" ? window.location.origin : "")
  return `${base}/ingest/${publicKey}`
}
