import { describe, expect, it } from "vitest"

import { formatValue } from "./format.ts"

describe("formatValue", () => {
  it("renders missing data as 'No data', never as zero", () => {
    expect(formatValue(null, "TWh")).toBe("No data")
    expect(formatValue(undefined, "TWh")).toBe("No data")
  })

  it("keeps zero as an explicit zero, distinct from missing", () => {
    expect(formatValue(0, "TWh")).toBe("0 TWh")
  })

  it("formats finite values with the unit", () => {
    expect(formatValue(1234, "TWh")).toBe("1,234 TWh")
    expect(formatValue(0.5, "TWh")).toBe("0.5 TWh")
  })

  it("treats non-finite numbers as missing", () => {
    expect(formatValue(Number.NaN, "TWh")).toBe("No data")
    expect(formatValue(Number.POSITIVE_INFINITY, "TWh")).toBe("No data")
  })
})
