import type { Meta, StoryObj } from "@storybook/react-vite"
import { Badge } from "./badge"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

const meta = {
  title: "Primitives/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

const ISSUES = [
  {
    id: "ISS-001",
    title: "TypeError: Cannot read properties of undefined",
    count: 142,
    status: "open",
  },
  {
    id: "ISS-002",
    title: "Unhandled Promise rejection in fetchUser",
    count: 87,
    status: "open",
  },
  {
    id: "ISS-003",
    title: "RangeError: Maximum call stack size exceeded",
    count: 34,
    status: "resolved",
  },
  {
    id: "ISS-004",
    title: "NetworkError: Failed to fetch /api/projects",
    count: 12,
    status: "ignored",
  },
]

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent issues from the last 24 hours.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Events</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ISSUES.map((issue) => (
          <TableRow key={issue.id}>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {issue.id}
            </TableCell>
            <TableCell className="max-w-xs truncate">{issue.title}</TableCell>
            <TableCell>{issue.count}</TableCell>
            <TableCell>
              <Badge
                variant={
                  issue.status === "open"
                    ? "destructive"
                    : issue.status === "resolved"
                      ? "secondary"
                      : "outline"
                }
              >
                {issue.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Events</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={4}
            className="text-center text-muted-foreground py-10"
          >
            No issues found.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}
