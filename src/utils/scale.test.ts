import { describe, expect, it } from "vitest"

import {
  BUCKET_COLORS,
  BUCKET_THRESHOLDS,
  colorForValue,
  fillColorExpression,
  legendEntries,
  MISSING_COLOR,
  ZERO_COLOR,
} from "./scale.ts"

describe("choropleth scale", () => {
  it("keeps missing, zero and positive visually distinct", () => {
    expect(colorForValue(null)).toBe(MISSING_COLOR)
    expect(colorForValue(0)).toBe(ZERO_COLOR)
    expect(colorForValue(0.5)).toBe(BUCKET_COLORS[0])
    // The three states must be three different colours — over half of all
    // published source cells are exactly zero, so conflating zero with either
    // "no data" or "a small amount" would misrepresent the dataset.
    expect(new Set([MISSING_COLOR, ZERO_COLOR, BUCKET_COLORS[0]]).size).toBe(3)
  })

  it("assigns higher buckets to higher values", () => {
    expect(colorForValue(0.5)).toBe(BUCKET_COLORS[0])
    expect(colorForValue(5)).toBe(BUCKET_COLORS[2])
    expect(colorForValue(9999)).toBe(BUCKET_COLORS[BUCKET_COLORS.length - 1])
  })

  it("treats a value below the two-decimal floor as zero", () => {
    expect(colorForValue(0.001)).toBe(ZERO_COLOR)
    expect(colorForValue(0.01)).toBe(BUCKET_COLORS[0])
  })

  it("has strictly increasing thresholds matching the palette length", () => {
    expect(BUCKET_THRESHOLDS.length).toBe(BUCKET_COLORS.length)
    for (let index = 1; index < BUCKET_THRESHOLDS.length; index += 1) {
      expect(BUCKET_THRESHOLDS[index]!).toBeGreaterThan(BUCKET_THRESHOLDS[index - 1]!)
    }
  })

  it("legend names the not-reported and zero states explicitly", () => {
    const entries = legendEntries("TWh")
    expect(entries[0]).toEqual({ label: "Not reported", color: MISSING_COLOR })
    expect(entries[1]).toEqual({ label: "Zero TWh", color: ZERO_COLOR })
    expect(entries).toHaveLength(BUCKET_COLORS.length + 2)
    expect(entries[entries.length - 1]?.label).toContain("≥")
  })

  it("map expression defaults to the missing colour before any feature state", () => {
    const expression = fillColorExpression()
    expect(expression[0]).toBe("step")
    expect(expression[2]).toBe(MISSING_COLOR)
    // First stop is the exact-zero class.
    expect(expression[3]).toBe(0)
    expect(expression[4]).toBe(ZERO_COLOR)
  })
})
