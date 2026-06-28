import { Button } from "#/components/ui/button"
import { useLogout } from "./use-logout"

// Ends the session and returns the user to /login. Logout logic lives in
// useLogout so the sidebar footer can share it without duplicating the
// mutation and navigation code.
export function LogoutButton() {
  const { handleLogout, pending } = useLogout()

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
