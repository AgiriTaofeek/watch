import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select"

const meta = {
  title: "Primitives/Select",
  component: Select,
  parameters: { layout: "centered" },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select a project" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="watch">Watch</SelectItem>
        <SelectItem value="platform">Platform</SelectItem>
        <SelectItem value="mobile">Mobile</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const SizeSm: Story = {
  name: "Size / SM",
  render: (args) => (
    <Select {...args}>
      <SelectTrigger size="sm" className="w-48">
        <SelectValue placeholder="Select environment" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="production">Production</SelectItem>
        <SelectItem value="staging">Staging</SelectItem>
        <SelectItem value="development">Development</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const WithGroups: Story = {
  name: "With Groups",
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select time range" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Relative</SelectLabel>
          <SelectItem value="1h">Last 1 hour</SelectItem>
          <SelectItem value="24h">Last 24 hours</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Fixed</SelectLabel>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="this-week">This week</SelectItem>
          <SelectItem value="this-month">This month</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
}

export const Disabled: Story = {
  render: (args) => (
    <Select {...args} disabled>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Disabled" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Option A</SelectItem>
      </SelectContent>
    </Select>
  ),
}
