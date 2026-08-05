import type { FeatureCollection } from "geojson"

import { isEvidenceType, type EvidenceType } from "../domain/evidence.ts"
import { DATA_BASE_URL } from "./manifest.ts"

export class DataFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DataFileError"
  }
}

export type YearFile = {
  metric: string
  year: number
  unit: string
  sourceId: string
  datasetVersion: string
  evidenceType: EvidenceType
  values: Record<string, number>
  worldTotal: number | null
}

export type GeographyIndexEntry = { id: number; iso3: string; name: string }

export type GeographyIndex = {
  geometrySource: string
  geometryVersion: string
  countries: GeographyIndexEntry[]
  byIso3: Map<string, GeographyIndexEntry>
  byId: Map<number, GeographyIndexEntry>
}

export type SeriesPoint = [year: number, value: number]

export type CountrySeriesEntry = {
  unit: string
  sourceId: string
  evidenceType: EvidenceType
  points: SeriesPoint[]
}

export type CountrySeries = {
  iso3: string
  name: string
  series: Record<string, CountrySeriesEntry>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Data files are fetched with a version query derived from the manifest's
// generatedAt: the always-revalidated manifest then acts as the cache key
// for everything below it, so cached year/series files can never be stale
// relative to the manifest that referenced them.
let dataVersion: string | null = null

export function setDataVersion(version: string): void {
  if (dataVersion !== version) {
    dataVersion = version
    yearFileCache.clear()
    seriesCache.clear()
  }
}

function dataUrl(relativePath: string): string {
  const suffix = dataVersion ? `?v=${encodeURIComponent(dataVersion)}` : ""
  return `${DATA_BASE_URL}${relativePath}${suffix}`
}

async function fetchJson(relativePath: string): Promise<unknown> {
  const response = await fetch(dataUrl(relativePath))
  if (!response.ok) {
    throw new DataFileError(`${relativePath}: request failed with status ${response.status}`)
  }
  return response.json()
}

const yearFileCache = new Map<string, Promise<YearFile>>()

export function loadYearFile(datasetPath: string, year: number): Promise<YearFile> {
  const relative = `${datasetPath}/${year}.json`
  const cached = yearFileCache.get(relative)
  if (cached) return cached
  const promise = fetchJson(relative).then((raw) => parseYearFile(raw, relative))
  yearFileCache.set(relative, promise)
  promise.catch(() => yearFileCache.delete(relative))
  return promise
}

export function parseYearFile(raw: unknown, label: string): YearFile {
  if (!isRecord(raw)) throw new DataFileError(`${label}: not an object`)
  const { metric, year, unit, sourceId, datasetVersion, evidenceType, values, worldTotal } = raw
  if (typeof metric !== "string" || typeof unit !== "string" || typeof sourceId !== "string") {
    throw new DataFileError(`${label}: missing metric/unit/sourceId`)
  }
  if (typeof datasetVersion !== "string") {
    throw new DataFileError(`${label}: missing datasetVersion`)
  }
  if (!Number.isInteger(year)) throw new DataFileError(`${label}: year must be an integer`)
  if (!isEvidenceType(evidenceType)) {
    throw new DataFileError(`${label}: invalid evidenceType ${JSON.stringify(evidenceType)}`)
  }
  if (!isRecord(values)) throw new DataFileError(`${label}: values must be an object`)
  for (const [iso3, value] of Object.entries(values)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new DataFileError(`${label}: non-numeric value for ${iso3}`)
    }
  }
  if (worldTotal !== undefined && (typeof worldTotal !== "number" || !Number.isFinite(worldTotal))) {
    throw new DataFileError(`${label}: worldTotal must be a finite number when present`)
  }
  return {
    metric,
    year: year as number,
    unit,
    sourceId,
    datasetVersion,
    evidenceType,
    values: values as Record<string, number>,
    worldTotal: typeof worldTotal === "number" ? worldTotal : null,
  }
}

let geographyIndexPromise: Promise<GeographyIndex> | null = null

export function loadGeographyIndex(relativePath: string): Promise<GeographyIndex> {
  geographyIndexPromise ??= fetchJson(relativePath).then((raw) => {
    if (!isRecord(raw) || !Array.isArray(raw.countries)) {
      throw new DataFileError(`${relativePath}: invalid geography index`)
    }
    const countries: GeographyIndexEntry[] = raw.countries.map((entry) => {
      if (
        !isRecord(entry) ||
        !Number.isInteger(entry.id) ||
        typeof entry.iso3 !== "string" ||
        typeof entry.name !== "string"
      ) {
        throw new DataFileError(`${relativePath}: invalid country entry`)
      }
      return { id: entry.id as number, iso3: entry.iso3, name: entry.name }
    })
    return {
      geometrySource: typeof raw.geometrySource === "string" ? raw.geometrySource : "unknown",
      geometryVersion: typeof raw.geometryVersion === "string" ? raw.geometryVersion : "unknown",
      countries,
      byIso3: new Map(countries.map((c) => [c.iso3, c])),
      byId: new Map(countries.map((c) => [c.id, c])),
    }
  })
  return geographyIndexPromise
}

let geojsonPromise: Promise<FeatureCollection> | null = null

export function loadCountriesGeojson(relativePath: string): Promise<FeatureCollection> {
  geojsonPromise ??= fetchJson(relativePath).then((raw) => {
    if (!isRecord(raw) || raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
      throw new DataFileError(`${relativePath}: not a FeatureCollection`)
    }
    return raw as unknown as FeatureCollection
  })
  return geojsonPromise
}

const seriesCache = new Map<string, Promise<CountrySeries | null>>()

/** Returns null when the geography has no series file at all (explicit
 * missing data), and throws only on genuine transport/schema errors. */
export function loadCountrySeries(
  template: string,
  iso3: string,
): Promise<CountrySeries | null> {
  const relative = template.replace("{iso3}", iso3)
  const cached = seriesCache.get(relative)
  if (cached) return cached
  const promise = fetch(dataUrl(relative)).then(async (response) => {
    if (response.status === 404) return null
    if (!response.ok) {
      throw new DataFileError(`${relative}: request failed with status ${response.status}`)
    }
    const raw: unknown = await response.json()
    if (!isRecord(raw) || typeof raw.iso3 !== "string" || !isRecord(raw.series)) {
      throw new DataFileError(`${relative}: invalid country series`)
    }
    const series: Record<string, CountrySeriesEntry> = {}
    for (const [metricId, entry] of Object.entries(raw.series)) {
      if (
        !isRecord(entry) ||
        typeof entry.unit !== "string" ||
        typeof entry.sourceId !== "string" ||
        !isEvidenceType(entry.evidenceType) ||
        !Array.isArray(entry.points)
      ) {
        throw new DataFileError(`${relative}: invalid series entry ${metricId}`)
      }
      series[metricId] = {
        unit: entry.unit,
        sourceId: entry.sourceId,
        evidenceType: entry.evidenceType,
        points: entry.points as SeriesPoint[],
      }
    }
    return {
      iso3: raw.iso3,
      name: typeof raw.name === "string" ? raw.name : raw.iso3,
      series,
    }
  })
  seriesCache.set(relative, promise)
  promise.catch(() => seriesCache.delete(relative))
  return promise
}

/** Test hook: clears module-level caches between test cases. */
export function resetDataCaches(): void {
  yearFileCache.clear()
  seriesCache.clear()
  geographyIndexPromise = null
  geojsonPromise = null
  dataVersion = null
}
