import type { Meta, StoryObj } from "@storybook/react-vite"
import { toast } from "sonner"
import { Button } from "./button"
import { Toaster } from "./sonner"

const meta = {
  title: "Primitives/Sonner",
  component: Toaster,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast("Event captured")}>
      Show toast
    </Button>
  ),
}

export const Success: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => toast.success("Project created successfully")}
    >
      Success toast
    </Button>
  ),
}

export const ErrorToast: Story = {
  name: "Error",
  render: () => (
    <Button
      variant="outline"
      onClick={() => toast.error("Failed to rotate API key")}
    >
      Error toast
    </Button>
  ),
}

export const Warning: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => toast.warning("Approaching event limit")}
    >
      Warning toast
    </Button>
  ),
}

export const Info: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => toast.info("Retention policy updated")}
    >
      Info toast
    </Button>
  ),
}

export const Loading: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => {
        const id = toast.loading("Rotating API key…")
        setTimeout(() => toast.success("Key rotated", { id }), 2000)
      }}
    >
      Loading → Success
    </Button>
  ),
}

export const AllTypes: Story = {
  name: "All Types",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => toast("Default")}>
        Default
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.success("Success")}
      >
        Success
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.error("Error")}>
        Error
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.warning("Warning")}
      >
        Warning
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.info("Info")}>
        Info
      </Button>
    </div>
  ),
}
