import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Textarea } from "./textarea"

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  args: { onChange: fn() },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { placeholder: "Write a description..." },
}

export const WithValue: Story = {
  name: "With Value",
  args: { defaultValue: "This is some pre-filled content." },
}

export const Disabled: Story = {
  args: { placeholder: "Disabled", disabled: true },
}

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "Invalid content" },
}
