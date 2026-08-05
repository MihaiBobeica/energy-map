/**
 * Per-capita derivation.
 *
 * A per-capita figure is a DERIVED value: it combines an observed electricity
 * total with a population estimate from a different source. It is therefore
 * never more certain than its weakest input, and it does not exist at all for
 * a country-year where either input is missing — the project rule is to
 * disable an unavailable metric, never to fabricate or extrapolate one.
 */

/** 1 TWh = 1e9 kWh. */
const KWH_PER_TWH = 1e9

export const PER_CAPITA_UNIT = "kWh per person"

/**
 * Converts a total in TWh and a population count into kWh per person.
 * Returns null when either input is missing, or when population is not a
 * usable positive number — a zero or negative denominator has no meaning and
 * must not become Infinity on the map.
 */
export function perCapita(totalTwh: number | null, population: number | null): number | null {
  if (totalTwh === null || population === null) return null
  if (!Number.isFinite(totalTwh) || !Number.isFinite(population)) return null
  if (population <= 0) return null
  return (totalTwh * KWH_PER_TWH) / population
}

/**
 * Years for which per-capita can be shown: the intersection of the dataset's
 * own time points with the years population data actually covers. Population
 * sources lag electricity statistics, so the most recent year or two typically
 * has no denominator.
 */
export function perCapitaYears(datasetYears: number[], populationYears: Set<number>): number[] {
  return datasetYears.filter((year) => populationYears.has(year))
}

export function isPerCapitaAvailable(year: number, populationYears: Set<number>): boolean {
  return populationYears.has(year)
}
