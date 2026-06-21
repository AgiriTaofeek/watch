import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { setup } from "#/lib/api"
import { SetupForm } from "./setup-form"

// The form depends on the `setup` server function; mock the data layer so these
// tests exercise the component's behavior, not the BFF transport (covered in
// src/lib/api/server/request.test.ts). setup returns a Result, so mocks resolve
// with { ok } objects rather than throwing.
vi.mock("#/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/api")>()
  return { ...actual, setup: vi.fn() }
})

const MOCK_USER = {
  id: "u1",
  email: "owner@example.com",
  display_name: null,
  role: "owner",
  created_at: "2024-01-01T00:00:00Z",
}

const mockSetup = vi.mocked(setup)

beforeEach(() => mockSetup.mockReset())

describe("SetupForm", () => {
  test("renders email and password fields", () => {
    render(<SetupForm onSuccess={vi.fn()} onAlreadySetUp={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /set up watch/i }),
    ).toBeInTheDocument()
  })

  test("calls onSuccess after creating the first account", async () => {
    const user = userEvent.setup()
    const handleSuccess = vi.fn()
    mockSetup.mockResolvedValue({ ok: true, data: MOCK_USER })
    render(<SetupForm onSuccess={handleSuccess} onAlreadySetUp={vi.fn()} />)
    await user.type(screen.getByLabelText(/email/i), "owner@example.com")
    await user.type(screen.getByLabelText(/password/i), "s3cret!")
    await user.click(screen.getByRole("button", { name: /set up watch/i }))
    await waitFor(() => expect(handleSuccess).toHaveBeenCalledOnce())
    expect(mockSetup).toHaveBeenCalledWith({
      data: { email: "owner@example.com", password: "s3cret!" },
    })
  })

  test("calls onAlreadySetUp when setup is already complete (409)", async () => {
    const user = userEvent.setup()
    const handleAlreadySetUp = vi.fn()
    mockSetup.mockResolvedValue({
      ok: false,
      status: 409,
      message: "setup already completed",
    })
    render(
      <SetupForm onSuccess={vi.fn()} onAlreadySetUp={handleAlreadySetUp} />,
    )
    await user.type(screen.getByLabelText(/email/i), "a@b.com")
    await user.type(screen.getByLabelText(/password/i), "pass")
    await user.click(screen.getByRole("button", { name: /set up watch/i }))
    await waitFor(() => expect(handleAlreadySetUp).toHaveBeenCalledOnce())
  })

  test("shows error message when the server rejects the request", async () => {
    const user = userEvent.setup()
    mockSetup.mockResolvedValue({
      ok: false,
      status: 400,
      message: "email and password are required",
    })
    render(<SetupForm onSuccess={vi.fn()} onAlreadySetUp={vi.fn()} />)
    await user.type(screen.getByLabelText(/email/i), "a@b.com")
    await user.type(screen.getByLabelText(/password/i), "pass")
    await user.click(screen.getByRole("button", { name: /set up watch/i }))
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "email and password are required",
      ),
    )
  })
})
