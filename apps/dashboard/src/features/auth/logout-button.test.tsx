import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { logout } from "#/lib/api"
import { LogoutButton } from "./logout-button"

const mockNavigate = vi.fn()
const mockSetQueryData = vi.fn()

// Stub the router/query hooks the button uses; keep the rest of each module real
// (meQueryOptions still needs the real queryOptions from react-query).
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mockNavigate,
}))
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}))
vi.mock("#/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/lib/api")>()),
  logout: vi.fn(),
}))

const mockLogout = vi.mocked(logout)

describe("LogoutButton", () => {
  test("calls logout, clears the user cache, and navigates to /login", async () => {
    const user = userEvent.setup()
    mockLogout.mockResolvedValue(undefined)
    render(<LogoutButton />)

    await user.click(screen.getByRole("button", { name: /log out/i }))

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" }),
    )
    expect(mockLogout).toHaveBeenCalledOnce()
    expect(mockSetQueryData).toHaveBeenCalledWith(["me"], null)
  })

  test("shows a pending label while signing out", async () => {
    const user = userEvent.setup()
    mockLogout.mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
    )
    render(<LogoutButton />)

    await user.click(screen.getByRole("button", { name: /log out/i }))
    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled()
  })
})
