import { expect, test } from "@playwright/test"

test("root route responds without crashing", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.status()).toBeLessThan(500)
  // The page should render some content — not a blank document.
  await expect(page.locator("body")).not.toBeEmpty()
})

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})

test("direct navigation to a protected route redirects to login", async ({
  page,
}) => {
  await page.goto("/projects/fake-id/overview")
  await expect(page).toHaveURL(/\/login/)
})

// Full create-project → ingest → dashboard workflow requires a live Go server
// and database seed. Run this manually or in CI with a seeded test environment.
test.skip("full workflow: create project, ingest an event, view in dashboard", async () => {
  // Requires a live Go server and database seed. Implement once a seeded
  // test environment is available in CI.
})
