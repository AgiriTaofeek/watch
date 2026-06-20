import type { Meta, StoryObj } from "@storybook/react-vite"
import { Input } from "./input"
import { Label } from "./label"

const meta = {
  title: "Primitives/Label",
  component: Label,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: "Email address" },
}

export const WithInput: Story = {
  name: "With Input",
  render: () => (
    <div className="flex flex-col gap-2 w-64">
      <Label htmlFor="email">Email address</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
}

export const WithDisabledInput: Story = {
  name: "With Disabled Input",
  render: () => (
    <div className="flex flex-col gap-2 w-64">
      <Label htmlFor="disabled-email">Email address</Label>
      <Input
        id="disabled-email"
        type="email"
        placeholder="you@example.com"
        disabled
      />
    </div>
  ),
}
