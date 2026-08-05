/**
 * Fixed bucket scales for skewed positive metrics. A scale is identical across
 * years, metrics and energy sources so playback and source switches never
 * silently rescale the map: switching from coal to solar and watching the world
 * lighten is a true statement about the world, not an artefact.
 *
 * Three states are visually distinct, and the distinction is load-bearing:
 *   missing  — the country never reported this value
 *   zero     — the country reported exactly zero (over half of all source cells)
 *   positive — bucketed on a log-like scale
 * Colours are the colour-blind-safe YlGnBu sequential palette.
 *
 * Totals and per-capita values differ by orders of magnitude, so they get their
 * own thresholds. They deliberately share the palette: the colours mean
 * "relatively little" to "relatively much" within the selected view, and the
 * legend always states the actual numbers.
 */

export const MISSING_COLOR = "#d8dee4"
export const ZERO_COLOR = "#ffffff"

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

export type ScaleDefinition = {
  id: string
  unit: string
  /** Lower bound of each positive bucket; must match BUCKET_COLORS length. */
  thresholds: readonly number[]
  /** Values below this are treated as exactly zero. */
  zeroCutoff: number
}

/** Published values carry at most 2 decimals, so 0.005 is below any real positive. */
export const TOTAL_SCALE: ScaleDefinition = {
  id: "total",
  unit: "TWh",
  thresholds: [0.005, 1, 3, 10, 30, 100, 300, 1000, 3000],
  zeroCutoff: 0.005,
}

/** kWh per person. World average is ~3,500; Iceland exceeds 50,000. */
export const PER_CAPITA_SCALE: ScaleDefinition = {
  id: "per-capita",
  unit: "kWh per person",
  thresholds: [0.5, 100, 300, 1000, 3000, 6000, 10000, 20000, 40000],
  zeroCutoff: 0.5,
}

export type LegendEntry = { label: string; color: string }

function formatThreshold(value: number): string {
  return value >= 1000 ? `${(value / 1000).toLocaleString("en-US")}k` : String(value)
}

/**
 * The two categorical states, kept apart from the value ramp on purpose: they
 * are not the bottom of a continuum, they are different kinds of fact.
 */
export function categoricalStates(scale: ScaleDefinition): LegendEntry[] {
  return [
    { label: "Not reported", color: MISSING_COLOR },
    { label: `Zero ${scale.unit}`, color: ZERO_COLOR },
  ]
}

/**
 * Tick labels for the continuous ramp, one per bucket, each the bucket's lower
 * bound. The first is ">0" rather than "0": the zero-cutoff exists precisely so
 * that exactly-zero is its own state, and labelling the lowest positive bucket
 * "0" would contradict the "Zero" chip sitting beside it.
 */
export function rampTicks(scale: ScaleDefinition): string[] {
  return scale.thresholds.map((threshold, index) => {
    if (index === 0) return ">0"
    if (index === scale.thresholds.length - 1) return `${formatThreshold(threshold)}+`
    return formatThreshold(threshold)
  })
}

export function colorForValue(value: number | null, scale: ScaleDefinition): string {
  if (value === null || !Number.isFinite(value) || value < 0) return MISSING_COLOR
  if (value < scale.zeroCutoff) return ZERO_COLOR
  let color: string = BUCKET_COLORS[0]
  for (let index = 0; index < scale.thresholds.length; index += 1) {
    if (value >= (scale.thresholds[index] as number)) {
      color = BUCKET_COLORS[index] as string
    }
  }
  return color
}

/** Full text description of every band, used for screen readers and titles. */
export function legendEntries(scale: ScaleDefinition): LegendEntry[] {
  const entries = categoricalStates(scale)
  for (let index = 0; index < scale.thresholds.length; index += 1) {
    const lower = scale.thresholds[index] as number
    const upper = scale.thresholds[index + 1]
    const lowerLabel = index === 0 ? "more than 0" : formatThreshold(lower)
    entries.push({
      label:
        upper === undefined
          ? `${formatThreshold(lower)} or more ${scale.unit}`
          : `${lowerLabel} to ${formatThreshold(upper)} ${scale.unit}`,
      color: BUCKET_COLORS[index] as string,
    })
  }
  return entries
}

/**
 * MapLibre paint expression. No feature state (missing) renders in the missing
 * colour via the -1 sentinel; an exact zero gets its own colour; positives step
 * through the scale's buckets.
 */
export function fillColorExpression(scale: ScaleDefinition): unknown[] {
  const step: unknown[] = [
    "step",
    ["coalesce", ["feature-state", "value"], -1],
    MISSING_COLOR,
    0,
    ZERO_COLOR,
  ]
  scale.thresholds.forEach((threshold, index) => {
    step.push(threshold, BUCKET_COLORS[index])
  })
  return step
}
