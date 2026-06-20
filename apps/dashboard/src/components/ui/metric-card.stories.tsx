import type { Meta, StoryObj } from "@storybook/react-vite"
import { MetricCard } from "./metric-card"

const meta = {
  title: "Watch/MetricCard",
  component: MetricCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MetricCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: "Total errors",
    value: "1,248",
    description: "Last 24 hours",
  },
}

export const WithTrendUp: Story = {
  name: "Trending up (worse)",
  args: {
    label: "Error rate",
    value: "3.2",
    unit: "%",
    trend: "up",
    trendLabel: "+0.4%",
    description: "vs. yesterday",
  },
}

export const WithTrendDown: Story = {
  name: "Trending down (better)",
  args: {
    label: "Error rate",
    value: "1.1",
    unit: "%",
    trend: "down",
    trendLabel: "−1.2%",
    description: "vs. yesterday",
  },
}

export const Loading: Story = {
  args: {
    label: "Total errors",
    value: "—",
    loading: true,
  },
}

export const AllCards: Story = {
  name: "Overview row",
  args: { label: "—", value: "—" },
  decorators: [
    (Story) => (
      <div className="grid grid-cols-2 gap-4 w-130">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <MetricCard label="Total errors" value="1,248" description="Last 24h" />
      <MetricCard
        label="Error rate"
        value="3.2"
        unit="%"
        trend="up"
        trendLabel="+0.4%"
        description="vs. yesterday"
      />
      <MetricCard
        label="Affected sessions"
        value="312"
        description="Last 24h"
      />
      <MetricCard
        label="LCP p75"
        value="2.1"
        unit="s"
        trend="down"
        trendLabel="−0.3s"
        description="vs. yesterday"
      />
    </>
  ),
}
