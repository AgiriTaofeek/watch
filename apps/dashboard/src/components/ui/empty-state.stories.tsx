import type { Meta, StoryObj } from "@storybook/react-vite"
import { FolderOpen, Key, TriangleAlert } from "lucide-react"
import { Button } from "./button"
import { EmptyState } from "./empty-state"

const meta = {
  title: "Watch/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const NoProjects: Story = {
  name: "No projects",
  args: {
    icon: FolderOpen,
    title: "No projects yet",
    description:
      "Create a project to start collecting errors and Web Vitals from your app.",
    action: <Button size="sm">Create project</Button>,
  },
}

export const NoKeys: Story = {
  name: "No ingestion keys",
  args: {
    icon: Key,
    title: "No ingestion keys",
    description: "Mint a key to get a DSN you can pass to @watch/browser.",
    action: <Button size="sm">Mint key</Button>,
  },
}

export const ErrorState: Story = {
  name: "Error state",
  args: {
    icon: TriangleAlert,
    title: "Failed to load data",
    description:
      "There was a problem fetching this data. Try refreshing the page.",
    action: (
      <Button variant="outline" size="sm">
        Retry
      </Button>
    ),
  },
}

export const TitleOnly: Story = {
  name: "Title only",
  args: {
    title: "No issues found",
  },
}
