import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { logout } from "#/lib/api"
import { meQueryOptions } from "#/lib/api/queries"

// Shared logout logic used by LogoutButton and the sidebar footer. Even if the
// server call fails we still clear local auth state and redirect — the user
// clicking "Log out" should always end up on the login screen.
export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    try {
      await logout()
    } catch {
      // Ignore: the finally block clears state and redirects regardless.
    } finally {
      queryClient.setQueryData(meQueryOptions().queryKey, null)
      await navigate({ to: "/login" })
    }
  }

  return { handleLogout, pending }
}
