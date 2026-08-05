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
