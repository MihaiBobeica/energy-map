import { afterEach, describe, expect, it, vi } from "vitest"

import { loadManifest, ManifestError, parseManifest } from "./manifest.ts"

const validManifest = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-08-05T00:00:00Z",
  datasets: [
    {
      id: "electricity-generation",
      title: "Electricity generation",
      metric: "electricity-generation",
      sourceId: "owid-electricity-generation",
      datasetVersion: "2026-01",
      evidenceTypes: ["observed"],
      years: [1985, 2025],
      path: "years/electricity-generation",
    },
  ],
}

describe("parseManifest", () => {
  it("accepts a valid manifest", () => {
    const manifest = parseManifest(validManifest)
    expect(manifest.schemaVersion).toBe("1.0.0")
    expect(manifest.datasets).toHaveLength(1)
    expect(manifest.datasets[0]?.evidenceTypes).toEqual(["observed"])
  })

  it("accepts an empty dataset list (application shell state)", () => {
    const manifest = parseManifest({
      schemaVersion: "1.0.0",
      generatedAt: "2026-08-05T00:00:00Z",
      datasets: [],
    })
    expect(manifest.datasets).toEqual([])
  })

  it("rejects non-objects", () => {
    expect(() => parseManifest(null)).toThrow(ManifestError)
    expect(() => parseManifest([])).toThrow(ManifestError)
  })

  it("rejects a missing or invalid generatedAt", () => {
    expect(() =>
      parseManifest({ schemaVersion: "1.0.0", generatedAt: "not-a-date", datasets: [] }),
    ).toThrow(/generatedAt/)
  })

  it("rejects unknown evidence types", () => {
    const bad = structuredClone(validManifest)
    bad.datasets[0]!.evidenceTypes = ["estimated"]
    expect(() => parseManifest(bad)).toThrow(/unknown evidence type/)
  })

  it("rejects duplicate dataset ids", () => {
    const bad = structuredClone(validManifest)
    bad.datasets.push(structuredClone(bad.datasets[0]!))
    expect(() => parseManifest(bad)).toThrow(/Duplicate dataset id/)
  })

  it("rejects absolute or escaping dataset paths", () => {
    const absolute = structuredClone(validManifest)
    absolute.datasets[0]!.path = "/etc/passwd"
    expect(() => parseManifest(absolute)).toThrow(/relative/)

    const escaping = structuredClone(validManifest)
    escaping.datasets[0]!.path = "../secrets"
    expect(() => parseManifest(escaping)).toThrow(/relative/)
  })
})

describe("loadManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads and parses the manifest over HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(validManifest), { status: 200 })),
    )
    const manifest = await loadManifest("https://example.test/data/manifest.json")
    expect(manifest.datasets).toHaveLength(1)
  })

  it("fails loudly on HTTP errors instead of silently returning defaults", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })))
    await expect(loadManifest("https://example.test/data/manifest.json")).rejects.toThrow(/404/)
  })
})
