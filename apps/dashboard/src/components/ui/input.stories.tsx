import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Input } from "./input"

const meta = {
  title: "Primitives/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: { onChange: fn() },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { placeholder: "Email address" },
}

export const WithValue: Story = {
  name: "With Value",
  args: { defaultValue: "user@example.com", type: "email" },
}

export const Password: Story = {
  args: { type: "password", placeholder: "Password" },
}

export const Disabled: Story = {
  args: { placeholder: "Disabled input", disabled: true },
}

export const Invalid: Story = {
  args: {
    placeholder: "Invalid input",
    "aria-invalid": true,
    defaultValue: "bad-value",
  },
}

export const File: Story = {
  args: { type: "file" },
}
