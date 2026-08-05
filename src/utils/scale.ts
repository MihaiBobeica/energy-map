/**
 * Fixed bucket scale for skewed positive metrics (TWh). The scale is identical
 * across years, metrics and energy sources so playback and source switches
 * never silently rescale the map: switching from coal to solar and watching the
 * world lighten is a true statement about the world, not an artefact.
 *
 * Three states are visually distinct, and the distinction is load-bearing:
 *   missing  — the country never reported this source
 *   zero     — the country reported exactly zero (over half of all cells)
 *   positive — bucketed on a log-like scale
 * Colours are the colour-blind-safe YlGnBu sequential palette.
 */

export const MISSING_COLOR = "#d8dee4"
export const ZERO_COLOR = "#ffffff"

/** Values are published with at most 2 decimals, so the smallest positive
 * value is 0.01 — anything below this cut is exactly zero. */
export const ZERO_CUTOFF = 0.005

export const BUCKET_THRESHOLDS = [ZERO_CUTOFF, 1, 3, 10, 30, 100, 300, 1000, 3000] as const

export const BUCKET_COLORS = [
  "#ffffd9",
  "#edf8b1",
  "#c7e9b4",
  "#7fcdbb",
  "#41b6c4",
  "#1d91c0",
  "#225ea8",
  "#253494",
  "#081d58",
] as const

export type LegendEntry = { label: string; color: string }

export function colorForValue(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return MISSING_COLOR
  if (value < ZERO_CUTOFF) return ZERO_COLOR
  let color: string = BUCKET_COLORS[0]
  for (let index = 0; index < BUCKET_THRESHOLDS.length; index += 1) {
    if (value >= (BUCKET_THRESHOLDS[index] as number)) {
      color = BUCKET_COLORS[index] as string
    }
  }
  return color
}

export function legendEntries(unit: string): LegendEntry[] {
  const entries: LegendEntry[] = [
    { label: "Not reported", color: MISSING_COLOR },
    { label: `Zero ${unit}`, color: ZERO_COLOR },
  ]
  for (let index = 0; index < BUCKET_THRESHOLDS.length; index += 1) {
    const upper = BUCKET_THRESHOLDS[index + 1]
    const lower = index === 0 ? 0 : (BUCKET_THRESHOLDS[index] as number)
    const label = upper === undefined ? `≥ ${lower} ${unit}` : `${lower} – ${upper} ${unit}`
    entries.push({ label, color: BUCKET_COLORS[index] as string })
  }
  return entries
}

/**
 * MapLibre paint expression. No feature state (missing) renders in the missing
 * colour via the -1 sentinel; an exact zero gets its own colour; positives step
 * through the fixed buckets.
 */
export function fillColorExpression(): unknown[] {
  const step: unknown[] = [
    "step",
    ["coalesce", ["feature-state", "value"], -1],
    MISSING_COLOR,
    0,
    ZERO_COLOR,
  ]
  BUCKET_THRESHOLDS.forEach((threshold, index) => {
    step.push(threshold, BUCKET_COLORS[index])
  })
  return step
}
