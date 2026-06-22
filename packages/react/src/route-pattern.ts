// Reconstructs a route *template* (e.g. "/users/:id") from an actual pathname
// plus the params React Router resolved for it. Used by the data/framework-mode
// adapter, which has the matched pathname + params (via useMatches) but — like
// every modern RR version — no public access to the route's `path` pattern.
//
// Strategy: work segment by segment. A segment that equals a param value becomes
// `:<key>`; a trailing splat (`*` param, which can span multiple segments)
// becomes `*`. Param keys are consumed left-to-right so two params that happen to
// share a value still map to distinct placeholders. Static segments are left as-is.
//
// Limitation: if a *static* segment coincidentally equals a param value it will be
// templated too. That's inherent to reconstructing without the route definition
// and is rare; richer fidelity needs the route tree (a future enhancement).
export function buildRoutePattern(
  pathname: string,
  params: Record<string, string | undefined>,
): string {
  let path = pathname
  let suffix = ""

  // Handle the splat param first: its value is the trailing portion of the path.
  const splat = params["*"]
  if (splat !== undefined) {
    if (splat === "") {
      path = path.replace(/\/$/, "")
    } else if (path.endsWith(splat)) {
      path = path.slice(0, path.length - splat.length).replace(/\/$/, "")
    }
    suffix = "/*"
  }

  // Non-splat params, consumed as they're matched so repeated values still map to
  // distinct keys.
  const entries = Object.entries(params).filter(
    ([key, value]) => key !== "*" && value !== undefined,
  ) as Array<[string, string]>

  const segments = path.split("/").map((segment) => {
    if (segment === "") return segment
    const i = entries.findIndex(([, value]) => value === segment)
    const entry = i === -1 ? undefined : entries[i]
    if (!entry) return segment
    entries.splice(i, 1)
    return `:${entry[0]}`
  })

  return (segments.join("/") || "/") + suffix
}
