import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { getVitalRollups, type VitalBucket } from "#/lib/api"
import { renderWithQuery } from "#/test/render"
import { VitalsScreen } from "./vitals-screen"

vi.mock("#/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/api")>()
  return { ...actual, getVitalRollups: vi.fn() }
})

const mockGetVitalRollups = vi.mocked(getVitalRollups)

const GOOD_LCP_BUCKET: VitalBucket = {
  period_start: "2026-06-23T00:00:00Z",
  p75: 1200,
  mean: 1000,
  sample_count: 50,
  health_score: 90,
}

const POOR_LCP_BUCKET: VitalBucket = {
  period_start: "2026-06-23T01:00:00Z",
  p75: 5000,
  mean: 4500,
  sample_count: 20,
  health_score: 20,
}

beforeEach(() => {
  mockGetVitalRollups.mockReset()
})

describe("VitalsScreen", () => {
  test("renders all 5 metric selector buttons", async () => {
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    // Each button's accessible name includes the metric abbreviation,
    // an em-dash placeholder, and "p75" — search by unique abbreviation only.
    for (const abbr of ["LCP", "CLS", "INP", "FCP", "TTFB"]) {
      await screen.findByRole("button", { name: new RegExp(abbr) })
    }
  })

  test("LCP is selected by default (chart header shows LCP)", async () => {
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    await screen.findByText(/LCP — Largest Contentful Paint/i)
  })

  test("clicking CLS switches the active metric", async () => {
    const user = userEvent.setup()
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    await screen.findByText(/LCP — Largest Contentful Paint/i)

    await user.click(screen.getByRole("button", { name: /CLS/ }))

    await screen.findByText(/CLS — Cumulative Layout Shift/i)
  })

  test("shows empty state when no buckets are returned", async () => {
    mockGetVitalRollups.mockResolvedValue({ metric: "LCP", buckets: [] })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    await screen.findByText(/no data yet/i)
  })

  test("renders bucket table rows when data is present", async () => {
    mockGetVitalRollups.mockResolvedValue({
      metric: "LCP",
      buckets: [GOOD_LCP_BUCKET, POOR_LCP_BUCKET],
    })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    await screen.findByText("Recent buckets")
    // Both buckets appear (reversed, sliced to 10)
    const rows = screen.getAllByRole("row")
    // header row + 2 data rows
    expect(rows.length).toBeGreaterThanOrEqual(3)
  })

  test("shows Good health badge for p75 within threshold", async () => {
    mockGetVitalRollups.mockResolvedValue({
      metric: "LCP",
      buckets: [GOOD_LCP_BUCKET], // p75=1200 ≤ 2500 → Good
    })
    renderWithQuery(<VitalsScreen projectId="p1" environmentId="e1" />)
    await waitFor(() =>
      expect(screen.getAllByText(/^good$/i).length).toBeGreaterThanOrEqual(1),
    )
  })
})
