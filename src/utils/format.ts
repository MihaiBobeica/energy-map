const numberFormat = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 4,
})

/**
 * Formats a metric value for display. Missing data is always rendered as
 * explicit "No data" — never as zero, and zero is never hidden.
 */
export function formatValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) {
    return "No data"
  }
  if (!Number.isFinite(value)) {
    return "No data"
  }
  return `${numberFormat.format(value)} ${unit}`.trim()
}

/**
 * A percentage share of some total.
 *
 * Exactly none of the total and too little to show at one decimal are
 * different facts, and rounding both to "0.0%" collapses the distinction this
 * atlas is built to keep. A reported zero says zero; anything positive that
 * would round away says so instead.
 */
export function formatShare(share: number): string {
  if (share === 0) return "0%"
  if (share > 0 && share < 0.1) return "< 0.1%"
  return `${share.toFixed(1)}%`
}
