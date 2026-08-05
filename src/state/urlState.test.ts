import { describe, expect, it } from "vitest"

import type { ManifestDataset } from "../data/manifest.ts"
import { buildSearch, parseUrlState, resolveState, snapToAvailableYear } from "./urlState.ts"

const dataset = (
  id: string,
  metric: string,
  energySource: string | null,
  years: number[],
  defaultYear: number,
): ManifestDataset => ({
  id,
  title: energySource ?? "All sources",
  metric,
  metricTitle: metric,
  energySource,
  sourceId: `src-${id}`,
  datasetVersion: "v",
  evidenceTypes: ["observed"],
  years,
  defaultYear,
  yearGeographyCounts: null,
  unit: "TWh",
  path: `years/${id}`,
})

const DATASETS = [
  dataset("electricity-generation", "electricity-generation", null, [2000, 2024], 2024),
  dataset("electricity-generation-solar", "electricity-generation", "solar", [2000, 2024], 2024),
  dataset("electricity-generation-coal", "electricity-generation", "coal", [2000, 2024], 2024),
  dataset("electricity-demand", "electricity-demand", null, [2000, 2024], 2024),
]

describe("parseUrlState", () => {
  it("parses valid parameters including the energy source", () => {
    expect(
      parseUrlState("?metric=electricity-generation&source=solar&year=2010&country=nld"),
    ).toEqual({
      metric: "electricity-generation",
      source: "solar",
      basis: null,
      year: 2010,
      country: "NLD",
    })
  })

  it("drops invalid parameters instead of breaking", () => {
    expect(parseUrlState("?metric=<script>&source=Coal!&year=notayear&country=x")).toEqual({
      metric: null,
      source: null,
      basis: null,
      year: null,
      country: null,
    })
    expect(parseUrlState("?year=1650")).toEqual({
      metric: null,
      source: null,
      basis: null,
      year: null,
      country: null,
    })
    expect(parseUrlState("")).toEqual({
      metric: null,
      source: null,
      basis: null,
      year: null,
      country: null,
    })
  })
})

describe("buildSearch", () => {
  it("round-trips through parseUrlState", () => {
    const search = buildSearch({
      metric: "electricity-generation",
      source: "solar",
      basis: "per-capita",
      year: 2023,
      country: "USA",
    })
    expect(parseUrlState(search)).toEqual({
      metric: "electricity-generation",
      source: "solar",
      basis: "per-capita",
      year: 2023,
      country: "USA",
    })
  })

  it("omits source, basis and country when they are at their defaults", () => {
    const search = buildSearch({
      metric: "m",
      source: null,
      basis: "total",
      year: 2024,
      country: null,
    })
    expect(search).not.toContain("source")
    expect(search).not.toContain("basis")
    expect(search).not.toContain("country")
  })
})

describe("resolveState", () => {
  it("falls back to the first dataset and its default year", () => {
    const resolved = resolveState(DATASETS, {
      metric: null,
      source: null,
      basis: null,
      year: null,
      country: null,
    })
    expect(resolved?.dataset.id).toBe("electricity-generation")
    expect(resolved?.year).toBe(2024)
  })

  it("resolves a metric plus energy source to the right dataset", () => {
    const resolved = resolveState(DATASETS, {
      metric: "electricity-generation",
      source: "coal",
      basis: null,
      year: null,
      country: null,
    })
    expect(resolved?.dataset.id).toBe("electricity-generation-coal")
  })

  it("falls back to the metric total when the source does not exist for it", () => {
    // Demand has no per-source split; asking for solar must not break.
    const resolved = resolveState(DATASETS, {
      metric: "electricity-demand",
      source: "solar",
      basis: null,
      year: null,
      country: null,
    })
    expect(resolved?.dataset.id).toBe("electricity-demand")
  })

  it("ignores an unknown source slug", () => {
    const resolved = resolveState(DATASETS, {
      metric: "electricity-generation",
      source: "unobtanium",
      basis: null,
      year: null,
      country: null,
    })
    expect(resolved?.dataset.id).toBe("electricity-generation")
  })

  it("snaps the year to real time points", () => {
    const resolved = resolveState(DATASETS, {
      metric: "electricity-demand",
      source: null,
      basis: null,
      year: 2003,
      country: "NLD",
    })
    expect(resolved?.year).toBe(2000)
    expect(resolved?.country).toBe("NLD")
  })

  it("returns null when no datasets exist", () => {
    expect(
      resolveState([], { metric: null, source: null, basis: null, year: null, country: null }),
    ).toBeNull()
  })
})

describe("snapToAvailableYear", () => {
  it("chooses the nearest available time point", () => {
    expect(snapToAvailableYear([2000, 2010, 2020], 2006)).toBe(2010)
    expect(snapToAvailableYear([2000, 2010, 2020], 1950)).toBe(2000)
    expect(snapToAvailableYear([2000, 2010, 2020], 2050)).toBe(2020)
  })
})
