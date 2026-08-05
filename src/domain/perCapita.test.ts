import { describe, expect, it } from "vitest"

import { isPerCapitaAvailable, perCapita, perCapitaYears } from "./perCapita.ts"

describe("perCapita", () => {
  it("converts TWh and population into kWh per person", () => {
    // 4391 TWh over 342 million people ≈ 12,839 kWh each.
    expect(perCapita(4391.02, 342_000_000)).toBeCloseTo(12839.24, 1)
    expect(perCapita(1, 1_000_000)).toBe(1000)
  })

  it("returns null when either input is missing rather than guessing", () => {
    expect(perCapita(null, 1_000_000)).toBeNull()
    expect(perCapita(100, null)).toBeNull()
    expect(perCapita(null, null)).toBeNull()
  })

  it("keeps a reported zero as zero", () => {
    expect(perCapita(0, 1_000_000)).toBe(0)
  })

  it("refuses a non-positive or non-finite denominator instead of yielding Infinity", () => {
    expect(perCapita(100, 0)).toBeNull()
    expect(perCapita(100, -5)).toBeNull()
    expect(perCapita(100, Number.NaN)).toBeNull()
    expect(perCapita(Number.POSITIVE_INFINITY, 1000)).toBeNull()
  })
})

describe("per-capita availability", () => {
  const populationYears = new Set([2000, 2001, 2022, 2023])

  it("offers only years where a denominator exists", () => {
    expect(perCapitaYears([2000, 2001, 2023, 2024, 2025], populationYears)).toEqual([
      2000, 2001, 2023,
    ])
  })

  it("reports availability for a single year", () => {
    expect(isPerCapitaAvailable(2023, populationYears)).toBe(true)
    // Population data lags electricity statistics; 2024 has no denominator.
    expect(isPerCapitaAvailable(2024, populationYears)).toBe(false)
  })
})
