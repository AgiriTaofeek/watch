import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "./button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"

const meta = {
  title: "Primitives/Card",
  component: Card,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Project Health</CardTitle>
        <CardDescription>Last 24 hours of activity</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">99.9%</p>
        <p className="text-sm text-muted-foreground">Uptime</p>
      </CardContent>
    </Card>
  ),
}

export const WithFooter: Story = {
  name: "With Footer",
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Invite teammates</CardTitle>
        <CardDescription>Share access to your Watch project.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Teammates can view issues, errors, and web vitals for this project.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button className="flex-1">Send invite</Button>
      </CardFooter>
    </Card>
  ),
}

export const WithAction: Story = {
  name: "With Action",
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Error rate</CardTitle>
        <CardDescription>Past 7 days</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">0.4%</p>
        <p className="text-sm text-muted-foreground mt-1">
          ↓ 0.1% from last week
        </p>
      </CardContent>
    </Card>
  ),
}
