import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DataFileError,
  loadCountriesGeojson,
  loadYearFile,
  parseYearFile,
  resetDataCaches,
  setDataVersion,
} from "./loaders.ts"

const valid = {
  metric: "electricity-generation",
  year: 2024,
  unit: "TWh",
  sourceId: "owid-electricity-generation",
  datasetVersion: "2026-04-24",
  evidenceType: "observed",
  values: { USA: 4200.25, ZRV: 0 },
  worldTotal: 27000.5,
}

describe("cache-coherent data URLs", () => {
  afterEach(() => {
    resetDataCaches()
    vi.unstubAllGlobals()
  })

  it("appends the manifest version to data-file requests", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) => new Response(JSON.stringify(valid), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    setDataVersion("2026-08-05T10:52:38Z")
    await loadYearFile("years/electricity-generation", 2024)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain("years/electricity-generation/2024.json?v=2026-08-05T10%3A52%3A38Z")
  })

  it("a new manifest version invalidates previously cached files", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    setDataVersion("v1")
    await loadYearFile("years/electricity-generation", 2024)
    await loadYearFile("years/electricity-generation", 2024)
    expect(fetchMock).toHaveBeenCalledTimes(1) // cached within a version
    setDataVersion("v2")
    await loadYearFile("years/electricity-generation", 2024)
    expect(fetchMock).toHaveBeenCalledTimes(2) // refetched under the new version
  })

  it("never caches a failed geometry fetch", async () => {
    // The geometry is fetched once per session. Caching the REJECTION left the
    // map blank for the whole session after one transient failure: every retry
    // re-read the cached error without issuing a request.
    const geojson = { type: "FeatureCollection", features: [] }
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(new Response(JSON.stringify(geojson), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(loadCountriesGeojson("geographies/countries.geojson")).rejects.toThrow()
    await expect(loadCountriesGeojson("geographies/countries.geojson")).resolves.toMatchObject({
      type: "FeatureCollection",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // A success, by contrast, is still cached: one geometry download a session.
    await loadCountriesGeojson("geographies/countries.geojson")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("parseYearFile", () => {
  it("accepts a valid year file, preserving zeros", () => {
    const file = parseYearFile(valid, "test")
    expect(file.values.USA).toBe(4200.25)
    expect(file.values.ZRV).toBe(0)
    expect(file.worldTotal).toBe(27000.5)
  })

  it("treats an absent worldTotal as null, not zero", () => {
    const withoutWorld: Record<string, unknown> = { ...valid }
    delete withoutWorld.worldTotal
    expect(parseYearFile(withoutWorld, "test").worldTotal).toBeNull()
  })

  it("rejects invalid evidence types", () => {
    expect(() => parseYearFile({ ...valid, evidenceType: "estimated" }, "test")).toThrow(
      DataFileError,
    )
  })

  it("rejects non-numeric values", () => {
    expect(() => parseYearFile({ ...valid, values: { USA: "high" } }, "test")).toThrow(
      /non-numeric/,
    )
  })

  it("rejects files missing provenance fields", () => {
    const withoutSource: Record<string, unknown> = { ...valid }
    delete withoutSource.sourceId
    expect(() => parseYearFile(withoutSource, "test")).toThrow(DataFileError)
  })
})
