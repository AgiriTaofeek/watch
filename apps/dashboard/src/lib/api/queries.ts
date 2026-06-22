import { queryOptions } from "@tanstack/react-query"
import { fetchMe } from "./auth"
import { listProjects } from "./projects"

// Shared TanStack Query options for the authenticated user. Using a factory
// function so query keys stay consistent everywhere they appear.
export const meQueryOptions = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60 * 1000, // treat the session as fresh for 5 minutes
    retry: false, // don't retry 401s — they mean "not logged in"
  })

// All projects with their environments and keys. The app shell uses this to
// populate the project/environment switchers and resolve display names from the
// projectId in the URL.
export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    staleTime: 60 * 1000,
  })
