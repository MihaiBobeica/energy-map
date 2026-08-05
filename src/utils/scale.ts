/**
 * Fixed logarithmic-style bucket scale for skewed positive metrics (TWh).
 * The scale is identical across years and metrics so playback and metric
 * switches never silently rescale the map. Colours are the colour-blind-safe
 * YlGnBu sequential palette; missing data has its own colour, never zero's.
 */

export const MISSING_COLOR = "#d8dee4"

export const BUCKET_THRESHOLDS = [0, 1, 3, 10, 30, 100, 300, 1000, 3000] as const

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
  let color: string = BUCKET_COLORS[0]
  for (let index = 0; index < BUCKET_THRESHOLDS.length; index += 1) {
    if (value >= (BUCKET_THRESHOLDS[index] as number)) {
      color = BUCKET_COLORS[index] as string
    }
  }
  return color
}

export function legendEntries(unit: string): LegendEntry[] {
  const entries: LegendEntry[] = [{ label: "No data", color: MISSING_COLOR }]
  for (let index = 0; index < BUCKET_THRESHOLDS.length; index += 1) {
    const lower = BUCKET_THRESHOLDS[index] as number
    const upper = BUCKET_THRESHOLDS[index + 1]
    const label = upper === undefined ? `≥ ${lower} ${unit}` : `${lower} – ${upper} ${unit}`
    entries.push({ label, color: BUCKET_COLORS[index] as string })
  }
  return entries
}

/**
 * MapLibre paint expression: missing (no feature state) renders in the
 * missing colour; values step through the fixed buckets. Zero is a real
 * value and lands in the first bucket, visibly distinct from missing.
 */
export function fillColorExpression(): unknown[] {
  const step: unknown[] = ["step", ["coalesce", ["feature-state", "value"], -1], MISSING_COLOR]
  BUCKET_THRESHOLDS.forEach((threshold, index) => {
    step.push(threshold, BUCKET_COLORS[index])
  })
  return step
}
