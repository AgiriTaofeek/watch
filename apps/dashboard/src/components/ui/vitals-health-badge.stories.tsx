import type { Meta, StoryObj } from "@storybook/react-vite"
import type { VitalsHealth } from "./vitals-health-badge"
import { VitalsHealthBadge } from "./vitals-health-badge"

const meta = {
  title: "Watch/VitalsHealthBadge",
  component: VitalsHealthBadge,
  parameters: { layout: "centered" },
  argTypes: {
    health: {
      control: "select",
      options: ["good", "needs-improvement", "poor"] satisfies VitalsHealth[],
    },
  },
} satisfies Meta<typeof VitalsHealthBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Good: Story = { args: { health: "good" } }
export const NeedsImprovement: Story = {
  name: "Needs improvement",
  args: { health: "needs-improvement" },
}
export const Poor: Story = { args: { health: "poor" } }

export const AllStates: Story = {
  name: "All states",
  args: { health: "good" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <VitalsHealthBadge health="good" />
      <VitalsHealthBadge health="needs-improvement" />
      <VitalsHealthBadge health="poor" />
    </div>
  ),
}
