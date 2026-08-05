import type { ManifestDataset } from "../data/manifest.ts"

export type UrlState = {
  metric: string | null
  year: number | null
  country: string | null
}

const ISO3_RE = /^[A-Z]{3}$/

/** Parses shareable-state query parameters. Invalid values become null and
 * fall back to defaults downstream — the URL can never break the app. */
export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)

  const metricRaw = params.get("metric")
  const metric = metricRaw && /^[a-z0-9-]+$/.test(metricRaw) ? metricRaw : null

  const yearRaw = params.get("year")
  const yearParsed = yearRaw ? Number.parseInt(yearRaw, 10) : Number.NaN
  const year =
    Number.isInteger(yearParsed) && yearParsed >= 1700 && yearParsed <= 2100 ? yearParsed : null

  const countryRaw = params.get("country")?.toUpperCase() ?? null
  const country = countryRaw && ISO3_RE.test(countryRaw) ? countryRaw : null

  return { metric, year, country }
}

export function buildSearch(state: {
  metric: string
  year: number
  country: string | null
}): string {
  const params = new URLSearchParams()
  params.set("metric", state.metric)
  params.set("year", String(state.year))
  if (state.country) params.set("country", state.country)
  return `?${params.toString()}`
}

export type ResolvedState = { dataset: ManifestDataset; year: number; country: string | null }

/** Resolves raw URL state against the manifest: unknown metric falls back to
 * the first dataset; a year outside the dataset's real time points snaps to
 * the nearest available one (never inventing time points). */
export function resolveState(datasets: ManifestDataset[], raw: UrlState): ResolvedState | null {
  const first = datasets[0]
  if (!first) return null
  const dataset = datasets.find((candidate) => candidate.id === raw.metric) ?? first
  const year =
    raw.year === null ? dataset.defaultYear : snapToAvailableYear(dataset.years, raw.year)
  return { dataset, year, country: raw.country }
}

export function snapToAvailableYear(years: number[], requested: number): number {
  let best = years[0] as number
  let bestDistance = Number.POSITIVE_INFINITY
  for (const year of years) {
    const distance = Math.abs(year - requested)
    if (distance < bestDistance) {
      best = year
      bestDistance = distance
    }
  }
  return best
}
