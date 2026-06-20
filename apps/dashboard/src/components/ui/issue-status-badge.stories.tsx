import type { Meta, StoryObj } from "@storybook/react-vite"
import type { IssueStatus } from "./issue-status-badge"
import { IssueStatusBadge } from "./issue-status-badge"

const meta = {
  title: "Watch/IssueStatusBadge",
  component: IssueStatusBadge,
  parameters: { layout: "centered" },
  argTypes: {
    status: {
      control: "select",
      options: ["open", "resolved", "ignored"] satisfies IssueStatus[],
    },
  },
} satisfies Meta<typeof IssueStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = { args: { status: "open" } }
export const Resolved: Story = { args: { status: "resolved" } }
export const Ignored: Story = { args: { status: "ignored" } }

export const AllStates: Story = {
  name: "All states",
  args: { status: "open" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <IssueStatusBadge status="open" />
      <IssueStatusBadge status="resolved" />
      <IssueStatusBadge status="ignored" />
    </div>
  ),
}
