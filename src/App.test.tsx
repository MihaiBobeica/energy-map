import { render, screen, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "./App.tsx"
import { resetDataCaches } from "./data/loaders.ts"

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
  const setWorkerUrl = vi.fn()
  return {
    Map: FakeMap,
    NavigationControl: FakeControl,
    AttributionControl: FakeControl,
    setWorkerUrl,
    default: {
      Map: FakeMap,
      NavigationControl: FakeControl,
      AttributionControl: FakeControl,
      setWorkerUrl,
    },
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
      years: [2000, 2024, 2025],
      defaultYear: 2024,
      yearGeographyCounts: [180, 196, 91],
      unit: "TWh",
      path: "years/electricity-generation",
    },
    {
      id: "electricity-demand",
      title: "Electricity demand",
      metric: "electricity-demand",
      sourceId: "owid-electricity-demand",
      datasetVersion: "2026-04-24",
      evidenceTypes: ["observed"],
      years: [1990, 2024],
      defaultYear: 2024,
      yearGeographyCounts: [150, 196],
      unit: "TWh",
      path: "years/electricity-demand",
    },
  ],
}

const geojson = { type: "FeatureCollection", features: [] }
const geographyIndex = {
  schemaVersion: "1.0.0",
  geometrySource: "natural-earth",
  geometryVersion: "test",
  countries: [{ id: 1, iso3: "USA", name: "United States" }],
}

function yearFile(metric: string, year: number) {
  return {
    metric,
    year,
    unit: "TWh",
    sourceId: `owid-${metric}`,
    datasetVersion: "2026-04-24",
    evidenceType: "observed",
    values: { USA: 4200.25 },
    worldTotal: 27000.5,
  }
}

function stubFetchRoutes() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      // Data-file URLs carry a cache-coherence query (?v=<generatedAt>).
      const url = String(input).replace(/\?.*$/, "")
      const respond = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 })
      if (url.endsWith("manifest.json")) return respond(manifest)
      if (url.endsWith("countries.geojson")) return respond(geojson)
      if (url.endsWith("geography-index.json")) return respond(geographyIndex)
      const yearMatch = /years\/([a-z-]+)\/(\d{4})\.json$/.exec(url)
      if (yearMatch) return respond(yearFile(yearMatch[1]!, Number(yearMatch[2])))
      if (url.includes("country-series/"))
        return respond({ iso3: "USA", name: "United States", series: {} })
      return new Response("not found", { status: 404 })
    }),
  )
}

beforeEach(() => {
  resetDataCaches()
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Atlas UI", () => {
  it("renders controls, legend and sources with the default year", async () => {
    stubFetchRoutes()
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Energy Map" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Metric" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Year" })).toBeInTheDocument()
    // defaultYear from the manifest, not the sparse latest year
    expect(screen.getByText("2024")).toBeInTheDocument()
    expect(screen.getByLabelText("Legend")).toBeInTheDocument()
    expect(screen.getByText("No data")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sources" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Methodology" })).toBeInTheDocument()
    expect(screen.getByTestId("map-container")).toBeInTheDocument()
  })

  it("switching metric keeps a shared year or snaps to the metric default", async () => {
    stubFetchRoutes()
    render(<App />)
    const select = await screen.findByRole("combobox", { name: "Metric" })

    fireEvent.change(select, { target: { value: "electricity-demand" } })
    expect((select as HTMLSelectElement).value).toBe("electricity-demand")
    expect(screen.getByText("2024")).toBeInTheDocument()
    expect(window.location.search).toContain("metric=electricity-demand")
  })

  it("initializes state from the URL and snaps invalid years to real time points", async () => {
    window.history.replaceState(null, "", "/?metric=electricity-demand&year=1993&country=usa")
    stubFetchRoutes()
    render(<App />)

    const select = await screen.findByRole("combobox", { name: "Metric" })
    expect((select as HTMLSelectElement).value).toBe("electricity-demand")
    // 1993 is not an available time point in the fixture; snaps to 1990
    expect(screen.getByText("1990")).toBeInTheDocument()
    // country=usa is invalid (lowercase is normalized), panel opens for USA
    expect(await screen.findByRole("heading", { name: "United States" })).toBeInTheDocument()
  })

  it("shows a partial-coverage note for sparse years", async () => {
    window.history.replaceState(null, "", "/?metric=electricity-generation&year=2025")
    stubFetchRoutes()
    render(<App />)

    expect(await screen.findByText(/Partial coverage: 91 countries/)).toBeInTheDocument()
  })

  it("shows an explicit failure state with retry when the manifest cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    )
    render(<App />)

    expect(await screen.findByText(/could not load its data manifest/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
