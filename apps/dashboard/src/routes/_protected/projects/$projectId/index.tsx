import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/projects/$projectId/")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/projects/$projectId/overview", params, search })
  },
})
