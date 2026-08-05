/**
 * STATUS: these two tests FAIL against the current App.tsx. That is the point —
 * they pin a live defect.
 *
 * App keeps a single `dataError` slot shared by the geometry loader and the
 * per-year loader, and the year loader calls setDataError(null) on success.
 * When countries.geojson fails but the year file succeeds, the successful year
 * load wipes the geometry error: the UI renders controls, legend, attribution
 * and an empty map with NO error message at all — visually identical to the
 * blank-map bug that shipped.
 *
 * Fix: track geometry and year errors separately (or tag errors by source) and
 * only clear the slot the successful load owns. These tests then pass.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "../../src/App.tsx"
import { resetDataCaches } from "../../src/data/loaders.ts"

vi.mock("maplibre-gl", () => {
  class FakeMap {
    addControl = vi.fn()
    removeControl = vi.fn()
    on = vi.fn()
    once = vi.fn()
    remove = vi.fn()
    getSource = vi.fn(() => undefined)
    addSource = vi.fn()
    addLayer = vi.fn()
    setFilter = vi.fn()
    setFeatureState = vi.fn()
    removeFeatureState = vi.fn()
    queryRenderedFeatures = vi.fn(() => [])
    getCanvas = vi.fn(() => ({ style: {} }))
  }
  class FakeControl {}
  return {
    Map: FakeMap,
    NavigationControl: FakeControl,
    AttributionControl: FakeControl,
    default: { Map: FakeMap, NavigationControl: FakeControl, AttributionControl: FakeControl },
  }
})

const manifest = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-08-05T00:00:00Z",
  countriesGeojsonPath: "geographies/countries.geojson",
  geographyIndexPath: "geography-index.json",
  countrySeriesPathTemplate: "country-series/{iso3}.json",
  worldSeriesPath: "world-series.json",
  datasets: [
    {
      id: "electricity-generation",
      title: "Electricity generation",
      metric: "electricity-generation",
      sourceId: "owid-electricity-generation",
      datasetVersion: "2026-04-24",
      evidenceTypes: ["observed"],
      years: [2023, 2024],
      defaultYear: 2024,
      unit: "TWh",
      path: "years/electricity-generation",
    },
  ],
}

function yearFile(year: number) {
  return {
    metric: "electricity-generation",
    year,
    unit: "TWh",
    sourceId: "owid-electricity-generation",
    datasetVersion: "2026-04-24",
    evidenceType: "observed",
    values: { USA: 4200 },
    worldTotal: 27000,
  }
}

/** Geometry always fails; year files always succeed. */
function stubBrokenGeometry() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input).replace(/\?.*$/, "")
      const ok = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 })
      if (url.endsWith("manifest.json")) return ok(manifest)
      if (url.endsWith("countries.geojson")) return new Response("boom", { status: 500 })
      if (url.endsWith("geography-index.json"))
        return ok({ schemaVersion: "1.0.0", countries: [{ id: 1, iso3: "USA", name: "USA" }] })
      const match = /\/(\d{4})\.json$/.exec(url)
      if (match) return ok(yearFile(Number(match[1])))
      return new Response("not found", { status: 404 })
    }),
  )
}

beforeEach(() => {
  resetDataCaches()
  window.history.replaceState(null, "", "/")
})
afterEach(() => vi.unstubAllGlobals())

describe("data errors must not be masked", () => {
  it("keeps the geometry failure visible after an unrelated year load succeeds", async () => {
    stubBrokenGeometry()
    render(<App />)

    // The geometry failure is reported.
    expect(await screen.findByText(/Data failed to load/)).toBeInTheDocument()

    // Loading a different year succeeds and — today — clears the unrelated
    // geometry error, leaving an empty map with no explanation at all.
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }))

    await waitFor(() => {
      expect(screen.queryByText(/Data failed to load/)).toBeInTheDocument()
    })
  })

  it("says something when geometry is missing, rather than showing an empty map", async () => {
    stubBrokenGeometry()
    render(<App />)
    // Any explicit signal that the map has no geometry is acceptable; silence
    // is not.
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
