import { describe, expect, it } from "vitest"

import { DataFileError, parseYearFile } from "./loaders.ts"

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
