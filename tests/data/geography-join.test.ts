import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The choropleth is painted with map.setFeatureState({ source, id }, { value })
 * where `id` comes from geography-index.json and must match the top-level
 * numeric `id` of the matching GeoJSON feature. If that join breaks, every
 * country renders in MISSING_COLOR: a map that looks "loaded" but shows no
 * data, with no error anywhere. Nothing else in the suite covers this.
 */

const DATA_ROOT = path.resolve(process.cwd(), "public/data")

type IndexEntry = { id: number; iso3: string; name: string }
type GeoFeature = { id?: unknown; properties?: { iso3?: unknown; name?: unknown } }

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(DATA_ROOT, relative), "utf8")) as T
}

const manifest = readJson<{
  countriesGeojsonPath: string
  geographyIndexPath: string
  datasets: { id: string; path: string; years: number[] }[]
}>("manifest.json")

describe("geometry / index / values join", () => {
  const index = readJson<{ countries: IndexEntry[] }>(manifest.geographyIndexPath)
  const geojson = readJson<{ type: string; features: GeoFeature[] }>(
    manifest.countriesGeojsonPath,
  )

  it("ships a non-empty FeatureCollection", () => {
    expect(geojson.type).toBe("FeatureCollection")
    // A zero-feature collection renders an empty map while every DOM-level
    // assertion still passes.
    expect(geojson.features.length).toBeGreaterThan(150)
  })

  it("every feature has an integer top-level id and an iso3 property", () => {
    const bad = geojson.features.filter(
      (feature) => !Number.isInteger(feature.id) || typeof feature.properties?.iso3 !== "string",
    )
    expect(bad).toHaveLength(0)
  })

  it("feature ids are unique", () => {
    const ids = geojson.features.map((feature) => feature.id as number)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("every geography-index id resolves to a feature with the same iso3", () => {
    const iso3ById = new Map(
      geojson.features.map((feature) => [feature.id as number, feature.properties?.iso3]),
    )
    const broken = index.countries.filter((entry) => iso3ById.get(entry.id) !== entry.iso3)
    expect(broken).toHaveLength(0)
  })

  it("the default year of every dataset joins to geometry for most countries", () => {
    const byIso3 = new Set(index.countries.map((entry) => entry.iso3))
    for (const dataset of manifest.datasets) {
      const latest = dataset.years[dataset.years.length - 1] as number
      const yearFile = readJson<{ values: Record<string, number> }>(
        `${dataset.path}/${latest}.json`,
      )
      const iso3s = Object.keys(yearFile.values)
      expect(iso3s.length, `${dataset.id} ${latest} has no values`).toBeGreaterThan(50)
      const joined = iso3s.filter((iso3) => byIso3.has(iso3))
      // A silent regeneration of either side would drop this ratio to ~0 while
      // every existing test still passes.
      expect(
        joined.length / iso3s.length,
        `${dataset.id} ${latest}: only ${joined.length}/${iso3s.length} values join to geometry`,
      ).toBeGreaterThan(0.9)
    }
  })
})
