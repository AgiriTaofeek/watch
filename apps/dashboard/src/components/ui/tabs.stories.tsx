import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  parameters: { layout: "centered" },
  args: { onValueChange: fn(), defaultValue: "overview", className: "w-96" },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="issues">Issues</TabsTrigger>
        <TabsTrigger value="vitals">Web Vitals</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground py-4">
          Project overview content.
        </p>
      </TabsContent>
      <TabsContent value="issues">
        <p className="text-sm text-muted-foreground py-4">
          Grouped error issues.
        </p>
      </TabsContent>
      <TabsContent value="vitals">
        <p className="text-sm text-muted-foreground py-4">
          Core web vitals metrics.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

export const LineVariant: Story = {
  name: "Line Variant",
  render: (args) => (
    <Tabs {...args}>
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="issues">Issues</TabsTrigger>
        <TabsTrigger value="vitals">Web Vitals</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground py-4">
          Project overview content.
        </p>
      </TabsContent>
      <TabsContent value="issues">
        <p className="text-sm text-muted-foreground py-4">
          Grouped error issues.
        </p>
      </TabsContent>
      <TabsContent value="vitals">
        <p className="text-sm text-muted-foreground py-4">
          Core web vitals metrics.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="issues">Issues</TabsTrigger>
        <TabsTrigger value="vitals">Web Vitals</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground p-4">
          Project overview content.
        </p>
      </TabsContent>
      <TabsContent value="issues">
        <p className="text-sm text-muted-foreground p-4">
          Grouped error issues.
        </p>
      </TabsContent>
      <TabsContent value="vitals">
        <p className="text-sm text-muted-foreground p-4">
          Core web vitals metrics.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

export const WithDisabledTab: Story = {
  name: "With Disabled Tab",
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="issues">Issues</TabsTrigger>
        <TabsTrigger value="vitals" disabled>
          Web Vitals
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-sm text-muted-foreground py-4">Overview content.</p>
      </TabsContent>
      <TabsContent value="issues">
        <p className="text-sm text-muted-foreground py-4">Issues content.</p>
      </TabsContent>
    </Tabs>
  ),
}
