import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Slider } from "./slider"

const meta = {
  title: "Primitives/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  args: { onValueChange: fn(), className: "w-64" },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { defaultValue: [40] },
}

export const Range: Story = {
  args: { defaultValue: [20, 70] },
}

export const MinMax: Story = {
  name: "Min / Max",
  args: { defaultValue: [500], min: 0, max: 1000, step: 50 },
}

export const Disabled: Story = {
  args: { defaultValue: [60], disabled: true },
}
