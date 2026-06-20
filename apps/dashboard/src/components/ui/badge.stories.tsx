import type { Meta, StoryObj } from "@storybook/react-vite"
import { Badge } from "./badge"

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { children: "Badge" } }
export const Secondary: Story = {
  args: { variant: "secondary", children: "Badge" },
}
export const Destructive: Story = {
  args: { variant: "destructive", children: "Error" },
}
export const Outline: Story = {
  args: { variant: "outline", children: "Badge" },
}
export const Ghost: Story = { args: { variant: "ghost", children: "Badge" } }
export const Link: Story = { args: { variant: "link", children: "Badge" } }

export const AllVariants: Story = {
  name: "All Variants",
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  ),
}
