import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { login } from "#/lib/api"
import { LoginForm } from "./login-form"

// The form depends on the `login` server function; mock the data layer so these
// tests exercise the component's behavior, not the BFF transport (covered in
// src/lib/api/server/request.test.ts). login returns a Result, so mocks resolve
// with { ok } objects rather than throwing.
vi.mock("#/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/api")>()
  return { ...actual, login: vi.fn() }
})

const MOCK_USER = {
  id: "u1",
  email: "dev@example.com",
  display_name: null,
  role: "owner",
  created_at: "2024-01-01T00:00:00Z",
}

const mockLogin = vi.mocked(login)

beforeEach(() => mockLogin.mockReset())

describe("LoginForm", () => {
  test("renders email and password fields", () => {
    render(<LoginForm onSuccess={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  test("shows error message when credentials are wrong (401)", async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValue({
      ok: false,
      status: 401,
      message: "invalid email or password",
    })
    render(<LoginForm onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText(/email/i), "a@b.com")
    await user.type(screen.getByLabelText(/password/i), "wrong")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid email or password.",
      ),
    )
  })

  test("calls onSuccess with the user when credentials are correct", async () => {
    const user = userEvent.setup()
    const handleSuccess = vi.fn()
    mockLogin.mockResolvedValue({ ok: true, data: MOCK_USER })
    render(<LoginForm onSuccess={handleSuccess} />)
    await user.type(screen.getByLabelText(/email/i), "dev@example.com")
    await user.type(screen.getByLabelText(/password/i), "correct")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    await waitFor(() => expect(handleSuccess).toHaveBeenCalledWith(MOCK_USER))
    expect(mockLogin).toHaveBeenCalledWith({
      data: { email: "dev@example.com", password: "correct" },
    })
  })

  test("disables the submit button while submitting", async () => {
    const user = userEvent.setup()
    mockLogin.mockReturnValue(
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, data: MOCK_USER }), 50),
      ),
    )
    render(<LoginForm onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText(/email/i), "a@b.com")
    await user.type(screen.getByLabelText(/password/i), "pass")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled()
  })
})
