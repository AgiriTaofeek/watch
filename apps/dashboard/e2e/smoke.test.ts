import { expect, test } from "@playwright/test"

test("root route responds without crashing", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.status()).toBeLessThan(500)
  // The page should render some content — not a blank document.
  await expect(page.locator("body")).not.toBeEmpty()
})
