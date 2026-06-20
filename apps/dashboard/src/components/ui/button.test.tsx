import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  test("renders its label", () => {
    render(<Button>Save changes</Button>)
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument()
  })

  test("calls onClick when clicked", async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Save changes</Button>)
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  test("does not call onClick when disabled", async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Save changes
      </Button>,
    )
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(handleClick).not.toHaveBeenCalled()
  })

  test("applies the destructive variant", () => {
    render(<Button variant="destructive">Delete project</Button>)
    expect(
      screen.getByRole("button", { name: "Delete project" }),
    ).toBeInTheDocument()
  })
})
