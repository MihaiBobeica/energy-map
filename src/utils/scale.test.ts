import { describe, expect, it } from "vitest"

import {
  BUCKET_COLORS,
  BUCKET_THRESHOLDS,
  colorForValue,
  fillColorExpression,
  legendEntries,
  MISSING_COLOR,
} from "./scale.ts"

describe("choropleth scale", () => {
  it("keeps missing visually distinct from zero", () => {
    expect(colorForValue(null)).toBe(MISSING_COLOR)
    expect(colorForValue(0)).toBe(BUCKET_COLORS[0])
    expect(colorForValue(0)).not.toBe(MISSING_COLOR)
  })

  it("assigns higher buckets to higher values", () => {
    expect(colorForValue(0.5)).toBe(BUCKET_COLORS[0])
    expect(colorForValue(5)).toBe(BUCKET_COLORS[2])
    expect(colorForValue(9999)).toBe(BUCKET_COLORS[BUCKET_COLORS.length - 1])
  })

  it("has strictly increasing thresholds matching the palette length", () => {
    expect(BUCKET_THRESHOLDS.length).toBe(BUCKET_COLORS.length)
    for (let index = 1; index < BUCKET_THRESHOLDS.length; index += 1) {
      expect(BUCKET_THRESHOLDS[index]!).toBeGreaterThan(BUCKET_THRESHOLDS[index - 1]!)
    }
  })

  it("legend starts with the explicit no-data state", () => {
    const entries = legendEntries("TWh")
    expect(entries[0]).toEqual({ label: "No data", color: MISSING_COLOR })
    expect(entries).toHaveLength(BUCKET_COLORS.length + 1)
    expect(entries[entries.length - 1]?.label).toContain("≥")
  })

  it("map expression defaults to the missing colour before any feature state", () => {
    const expression = fillColorExpression()
    expect(expression[0]).toBe("step")
    expect(expression[2]).toBe(MISSING_COLOR)
  })
})
