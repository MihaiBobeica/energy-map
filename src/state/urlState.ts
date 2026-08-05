import { findDataset, type ManifestDataset } from "../data/manifest.ts"

export type UrlState = {
  metric: string | null
  source: string | null
  basis: "total" | "per-capita" | null
  year: number | null
  country: string | null
}

const ISO3_RE = /^[A-Z]{3}$/
const SLUG_RE = /^[a-z0-9-]+$/

/** Parses shareable-state query parameters. Invalid values become null and
 * fall back to defaults downstream — the URL can never break the app. */
export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)

  const metricRaw = params.get("metric")
  const metric = metricRaw && SLUG_RE.test(metricRaw) ? metricRaw : null

  const sourceRaw = params.get("source")
  const source = sourceRaw && SLUG_RE.test(sourceRaw) ? sourceRaw : null

  const basisRaw = params.get("basis")
  const basis = basisRaw === "per-capita" || basisRaw === "total" ? basisRaw : null

  const yearRaw = params.get("year")
  const yearParsed = yearRaw ? Number.parseInt(yearRaw, 10) : Number.NaN
  const year =
    Number.isInteger(yearParsed) && yearParsed >= 1700 && yearParsed <= 2100 ? yearParsed : null

  const countryRaw = params.get("country")?.toUpperCase() ?? null
  const country = countryRaw && ISO3_RE.test(countryRaw) ? countryRaw : null

  return { metric, source, basis, year, country }
}

export function buildSearch(state: {
  metric: string
  source: string | null
  basis: "total" | "per-capita"
  year: number
  country: string | null
}): string {
  const params = new URLSearchParams()
  params.set("metric", state.metric)
  // Omitted for whole-system totals so the common URL stays short.
  if (state.source) params.set("source", state.source)
  if (state.basis === "per-capita") params.set("basis", "per-capita")
  params.set("year", String(state.year))
  if (state.country) params.set("country", state.country)
  return `?${params.toString()}`
}

export type ResolvedState = {
  dataset: ManifestDataset
  basis: "total" | "per-capita"
  year: number
  country: string | null
}

/**
 * Resolves raw URL state against the manifest. An unknown metric falls back to
 * the first dataset; an energy source that the metric does not offer falls back
 * to that metric's total rather than erroring; a year outside the dataset's real
 * time points snaps to the nearest available one (never inventing time points).
 */
export function resolveState(datasets: ManifestDataset[], raw: UrlState): ResolvedState | null {
  const first = datasets[0]
  if (!first) return null

  const metric = datasets.some((candidate) => candidate.metric === raw.metric)
    ? (raw.metric as string)
    : first.metric

  const dataset =
    findDataset(datasets, metric, raw.source) ??
    findDataset(datasets, metric, null) ??
    datasets.find((candidate) => candidate.metric === metric) ??
    first

  const year =
    raw.year === null ? dataset.defaultYear : snapToAvailableYear(dataset.years, raw.year)
  return { dataset, basis: raw.basis ?? "total", year, country: raw.country }
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
