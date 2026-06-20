import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Switch } from "./switch"

const meta = {
  title: "Primitives/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  args: { onCheckedChange: fn() },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Checked: Story = {
  args: { defaultChecked: true },
}

export const SizeSm: Story = {
  name: "Size / SM",
  args: { size: "sm" },
}

export const SizeSmChecked: Story = {
  name: "Size / SM Checked",
  args: { size: "sm", defaultChecked: true },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const DisabledChecked: Story = {
  name: "Disabled Checked",
  args: { disabled: true, defaultChecked: true },
}

export const AllSizes: Story = {
  name: "All Sizes",
  render: (args) => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Switch {...args} size="sm" defaultChecked />
        <span className="text-xs text-muted-foreground">SM</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Switch {...args} size="default" defaultChecked />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
    </div>
  ),
}
