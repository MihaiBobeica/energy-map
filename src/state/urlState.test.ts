import { describe, expect, it } from "vitest"

import type { ManifestDataset } from "../data/manifest.ts"
import { buildSearch, parseUrlState, resolveState, snapToAvailableYear } from "./urlState.ts"

const dataset = (id: string, years: number[], defaultYear: number): ManifestDataset => ({
  id,
  title: id,
  metric: id,
  sourceId: `src-${id}`,
  datasetVersion: "v",
  evidenceTypes: ["observed"],
  years,
  defaultYear,
  yearGeographyCounts: null,
  unit: "TWh",
  path: `years/${id}`,
})

describe("parseUrlState", () => {
  it("parses valid parameters", () => {
    expect(parseUrlState("?metric=electricity-demand&year=2010&country=nld")).toEqual({
      metric: "electricity-demand",
      year: 2010,
      country: "NLD",
    })
  })

  it("drops invalid parameters instead of breaking", () => {
    expect(parseUrlState("?metric=<script>&year=notayear&country=x")).toEqual({
      metric: null,
      year: null,
      country: null,
    })
    expect(parseUrlState("?year=1650")).toEqual({ metric: null, year: null, country: null })
    expect(parseUrlState("")).toEqual({ metric: null, year: null, country: null })
  })
})

describe("buildSearch", () => {
  it("round-trips through parseUrlState", () => {
    const search = buildSearch({ metric: "electricity-generation", year: 2024, country: "USA" })
    expect(parseUrlState(search)).toEqual({
      metric: "electricity-generation",
      year: 2024,
      country: "USA",
    })
  })

  it("omits the country when none is selected", () => {
    expect(buildSearch({ metric: "m", year: 2024, country: null })).not.toContain("country")
  })
})

describe("resolveState", () => {
  const datasets = [
    dataset("electricity-generation", [2000, 2024], 2024),
    dataset("electricity-demand", [1990, 2024], 2024),
  ]

  it("falls back to the first dataset and its default year", () => {
    const resolved = resolveState(datasets, { metric: null, year: null, country: null })
    expect(resolved?.dataset.id).toBe("electricity-generation")
    expect(resolved?.year).toBe(2024)
  })

  it("uses the requested metric and snaps the year to real time points", () => {
    const resolved = resolveState(datasets, {
      metric: "electricity-demand",
      year: 1994,
      country: "NLD",
    })
    expect(resolved?.dataset.id).toBe("electricity-demand")
    expect(resolved?.year).toBe(1990)
    expect(resolved?.country).toBe("NLD")
  })

  it("returns null when no datasets exist", () => {
    expect(resolveState([], { metric: null, year: null, country: null })).toBeNull()
  })
})

describe("snapToAvailableYear", () => {
  it("chooses the nearest available time point", () => {
    expect(snapToAvailableYear([1990, 2000, 2010], 1996)).toBe(2000)
    expect(snapToAvailableYear([1990, 2000, 2010], 1950)).toBe(1990)
    expect(snapToAvailableYear([1990, 2000, 2010], 2050)).toBe(2010)
  })
})
