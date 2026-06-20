import type { Meta, StoryObj } from "@storybook/react-vite"
import { InfoIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "./alert"

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>
        You can configure your project settings in the dashboard.
      </AlertDescription>
    </Alert>
  ),
}

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please sign in again.
      </AlertDescription>
    </Alert>
  ),
}

export const WithIcon: Story = {
  name: "With Icon",
  render: (args) => (
    <Alert {...args}>
      <InfoIcon />
      <AlertTitle>Retention policy active</AlertTitle>
      <AlertDescription>
        Events older than 90 days are automatically deleted.
      </AlertDescription>
    </Alert>
  ),
}

export const DestructiveWithIcon: Story = {
  name: "Destructive With Icon",
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <TriangleAlertIcon />
      <AlertTitle>Ingestion paused</AlertTitle>
      <AlertDescription>
        Your project has exceeded the free tier event limit. Upgrade to resume
        collection.
      </AlertDescription>
    </Alert>
  ),
}

export const AllVariants: Story = {
  name: "All Variants",
  render: () => (
    <div className="flex flex-col gap-4 w-full max-w-lg">
      <Alert>
        <InfoIcon />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>
          Informational message about your project.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>
          Something went wrong that needs attention.
        </AlertDescription>
      </Alert>
    </div>
  ),
}
