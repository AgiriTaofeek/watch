import type { Meta, StoryObj } from "@storybook/react-vite"
import { Settings } from "lucide-react"
import { fn } from "storybook/test"
import { Button } from "./button"

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// --- Variants ---

export const Default: Story = { args: { children: "Button" } }

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "Button" },
}

export const Secondary: Story = {
  args: { variant: "secondary", children: "Button" },
}

export const Ghost: Story = {
  args: { variant: "ghost", children: "Button" },
}

export const Link: Story = {
  args: { variant: "link", children: "Button" },
}

// --- Sizes ---

export const SizeXs: Story = {
  name: "Size / XS",
  args: { size: "xs", children: "Button" },
}

export const SizeSm: Story = {
  name: "Size / SM",
  args: { size: "sm", children: "Button" },
}

export const SizeDefault: Story = {
  name: "Size / Default",
  args: { size: "default", children: "Button" },
}

export const SizeLg: Story = {
  name: "Size / LG",
  args: { size: "lg", children: "Button" },
}

// --- Icon sizes (button that contains only an icon, no text) ---

export const IconDefault: Story = {
  name: "Icon / Default",
  args: { size: "icon", "aria-label": "Settings", children: <Settings /> },
}

export const IconSm: Story = {
  name: "Icon / SM",
  args: { size: "icon-sm", "aria-label": "Settings", children: <Settings /> },
}

export const IconXs: Story = {
  name: "Icon / XS",
  args: { size: "icon-xs", "aria-label": "Settings", children: <Settings /> },
}

export const IconLg: Story = {
  name: "Icon / LG",
  args: { size: "icon-lg", "aria-label": "Settings", children: <Settings /> },
}

// --- States ---

export const Disabled: Story = {
  args: { children: "Button", disabled: true },
}

export const DisabledDestructive: Story = {
  name: "Disabled / Destructive",
  args: { variant: "destructive", children: "Delete", disabled: true },
}

// --- All variants at a glance ---

export const AllVariants: Story = {
  name: "All Variants",
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
}

export const AllSizes: Story = {
  name: "All Sizes",
  render: (args) => (
    <div className="flex flex-wrap items-end gap-3">
      <Button {...args} size="xs">
        XS
      </Button>
      <Button {...args} size="sm">
        SM
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        LG
      </Button>
    </div>
  ),
}
