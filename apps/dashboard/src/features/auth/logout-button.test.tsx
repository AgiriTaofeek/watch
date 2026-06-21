import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
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

beforeEach(() => {
  mockLogout.mockReset()
  mockNavigate.mockReset()
  mockSetQueryData.mockReset()
})

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
    // Controlled promise: stays pending until we resolve it, so the signing-out
    // state is deterministic regardless of CI timing.
    let resolveLogout: () => void = () => {}
    mockLogout.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogout = () => resolve()
      }),
    )
    render(<LogoutButton />)

    await user.click(screen.getByRole("button", { name: /log out/i }))
    expect(
      await screen.findByRole("button", { name: /signing out/i }),
    ).toBeDisabled()
    // Resolve so the logout finishes (navigate runs) and the component settles.
    resolveLogout()
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" }),
    )
  })
})
