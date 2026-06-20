import type { Meta, StoryObj } from "@storybook/react-vite"
import { Skeleton } from "./skeleton"

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { className: "h-4 w-48" },
}

export const CardLoading: Story = {
  name: "Card Loading",
  render: () => (
    <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 w-80">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  ),
}

export const ListLoading: Story = {
  name: "List Loading",
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      {(["a", "b", "c", "d"] as const).map((id) => (
        <div key={id} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  ),
}

export const TableLoading: Story = {
  name: "Table Loading",
  render: () => (
    <div className="flex flex-col gap-2 w-120">
      <div className="flex gap-4 pb-2 border-b">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32 ml-auto" />
        <Skeleton className="h-4 w-20" />
      </div>
      {(["a", "b", "c", "d", "e"] as const).map((id) => (
        <div key={id} className="flex gap-4 py-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  ),
}
