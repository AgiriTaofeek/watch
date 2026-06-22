// Minimal ambient types for react-router-dom (v4/v5), an OPTIONAL peer dependency
// used only by the "@watch/react/router-v5" adapter. We intentionally do NOT
// install @types/react-router-dom in this workspace: it pulls @types/react-router,
// which conflicts with react-router v7's bundled types used by the v7 adapter.
// The real implementation comes from the consumer's installed react-router-dom@4/5.
declare module "react-router-dom" {
  export function useRouteMatch<
    Params extends Record<string, string | undefined> = Record<
      string,
      string | undefined
    >,
  >(): { path: string; url: string; params: Params; isExact: boolean } | null
}
