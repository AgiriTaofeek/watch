import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { logout } from "#/lib/api"
import { meQueryOptions } from "#/lib/api/queries"

// Ends the session and returns the user to /login. The logout server fn tells Go
// to delete the session and clear the watch_session/watch_csrf cookies (relayed
// to the browser by the BFF). Even if that call fails, we still drop local auth
// state and redirect — a user clicking "Log out" should always end up logged out.
export function LogoutButton() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    try {
      await logout()
    } catch {
      // Ignore: the finally block still clears state and redirects.
    } finally {
      // Mark the user logged out so route guards redirect immediately without a
      // refetch flash.
      queryClient.setQueryData(meQueryOptions().queryKey, null)
      await navigate({ to: "/login" })
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
    >
      {pending ? "Signing out…" : "Log out"}
    </Button>
  )
}
