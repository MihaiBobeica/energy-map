import { describe, expect, it } from "vitest"

import {
  BUCKET_COLORS,
  colorForValue,
  fillColorExpression,
  legendEntries,
  MISSING_COLOR,
  PER_CAPITA_SCALE,
  TOTAL_SCALE,
  ZERO_COLOR,
  type ScaleDefinition,
} from "./scale.ts"

const SCALES: ScaleDefinition[] = [TOTAL_SCALE, PER_CAPITA_SCALE]

describe.each(SCALES)("scale $id", (scale) => {
  it("keeps missing, zero and positive visually distinct", () => {
    expect(colorForValue(null, scale)).toBe(MISSING_COLOR)
    expect(colorForValue(0, scale)).toBe(ZERO_COLOR)
    expect(colorForValue(scale.thresholds[0]!, scale)).toBe(BUCKET_COLORS[0])
    expect(new Set([MISSING_COLOR, ZERO_COLOR, BUCKET_COLORS[0]]).size).toBe(3)
  })

  it("has strictly increasing thresholds matching the palette length", () => {
    expect(scale.thresholds.length).toBe(BUCKET_COLORS.length)
    for (let index = 1; index < scale.thresholds.length; index += 1) {
      expect(scale.thresholds[index]!).toBeGreaterThan(scale.thresholds[index - 1]!)
    }
  })

  it("assigns the top bucket to very large values", () => {
    const top = scale.thresholds[scale.thresholds.length - 1]!
    expect(colorForValue(top * 10, scale)).toBe(BUCKET_COLORS[BUCKET_COLORS.length - 1])
  })

  it("legend names not-reported and zero explicitly and states its unit", () => {
    const entries = legendEntries(scale)
    expect(entries[0]).toEqual({ label: "Not reported", color: MISSING_COLOR })
    expect(entries[1]).toEqual({ label: `Zero ${scale.unit}`, color: ZERO_COLOR })
    expect(entries).toHaveLength(BUCKET_COLORS.length + 2)
    expect(scale.unit).toBeTruthy()
  })

  it("map expression defaults to missing, then zero, before any bucket", () => {
    const expression = fillColorExpression(scale)
    expect(expression[0]).toBe("step")
    expect(expression[2]).toBe(MISSING_COLOR)
    expect(expression[3]).toBe(0)
    expect(expression[4]).toBe(ZERO_COLOR)
  })
})

describe("scale selection", () => {
  it("uses different thresholds for totals and per-capita", () => {
    // 5 TWh is a small national total; 5 kWh per person is almost nothing.
    expect(colorForValue(5, TOTAL_SCALE)).not.toBe(colorForValue(5, PER_CAPITA_SCALE))
    expect(TOTAL_SCALE.unit).toBe("TWh")
    expect(PER_CAPITA_SCALE.unit).toBe("kWh per person")
  })

  it("treats a value below the scale's floor as zero", () => {
    expect(colorForValue(0.001, TOTAL_SCALE)).toBe(ZERO_COLOR)
    expect(colorForValue(0.01, TOTAL_SCALE)).toBe(BUCKET_COLORS[0])
    expect(colorForValue(0.2, PER_CAPITA_SCALE)).toBe(ZERO_COLOR)
  })
})
