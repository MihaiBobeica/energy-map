import { isEvidenceType, type EvidenceType } from "../domain/evidence.ts"

export type ManifestDataset = {
  id: string
  /** Label for this dataset within its metric, e.g. "Coal" or "All sources". */
  title: string
  metric: string
  /** Label for the metric group, e.g. "Electricity generation". */
  metricTitle: string
  /** null for a whole-system total; otherwise the generation source id. */
  energySource: string | null
  sourceId: string
  datasetVersion: string
  evidenceTypes: EvidenceType[]
  years: number[]
  path: string
  unit: string
  defaultYear: number
  yearGeographyCounts: number[] | null
}

/** Distinct metrics in manifest order, for the metric selector. */
export function metricsOf(datasets: ManifestDataset[]): { id: string; title: string }[] {
  const seen = new Map<string, string>()
  for (const dataset of datasets) {
    if (!seen.has(dataset.metric)) seen.set(dataset.metric, dataset.metricTitle)
  }
  return [...seen].map(([id, title]) => ({ id, title }))
}

/** Datasets belonging to one metric, totals first, in manifest order. */
export function datasetsForMetric(
  datasets: ManifestDataset[],
  metric: string,
): ManifestDataset[] {
  return datasets.filter((dataset) => dataset.metric === metric)
}

export function findDataset(
  datasets: ManifestDataset[],
  metric: string,
  energySource: string | null,
): ManifestDataset | undefined {
  return datasets.find(
    (dataset) => dataset.metric === metric && dataset.energySource === energySource,
  )
}

export type DataManifest = {
  schemaVersion: string
  generatedAt: string
  datasets: ManifestDataset[]
  countriesGeojsonPath: string | null
  geographyIndexPath: string | null
  countrySeriesPathTemplate: string | null
  worldSeriesPath: string | null
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ManifestError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ManifestError(`${label} must be a non-empty string`)
  }
  return value
}

function optionalPath(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null
  const path = requireString(value, label)
  if (path.startsWith("/") || path.includes("..")) {
    throw new ManifestError(`${label} must be relative to the data root`)
  }
  return path
}

function parseDataset(input: unknown, index: number): ManifestDataset {
  if (!isRecord(input)) {
    throw new ManifestError(`datasets[${index}] is not an object`)
  }
  const id = requireString(input.id, `datasets[${index}].id`)
  const title = requireString(input.title, `dataset ${id}: title`)
  const metric = requireString(input.metric, `dataset ${id}: metric`)
  const metricTitle = requireString(input.metricTitle ?? title, `dataset ${id}: metricTitle`)
  const sourceId = requireString(input.sourceId, `dataset ${id}: sourceId`)
  if (
    input.energySource !== undefined &&
    input.energySource !== null &&
    (typeof input.energySource !== "string" || !/^[a-z0-9-]+$/.test(input.energySource))
  ) {
    throw new ManifestError(`dataset ${id}: energySource must be a slug or null`)
  }
  const energySource = (input.energySource ?? null) as string | null
  const datasetVersion = requireString(input.datasetVersion, `dataset ${id}: datasetVersion`)
  const unit = requireString(input.unit ?? "TWh", `dataset ${id}: unit`)

  const { evidenceTypes, years, path } = input
  if (!Array.isArray(evidenceTypes) || evidenceTypes.length === 0) {
    throw new ManifestError(`dataset ${id}: evidenceTypes must be a non-empty array`)
  }
  for (const evidence of evidenceTypes) {
    if (!isEvidenceType(evidence)) {
      throw new ManifestError(`dataset ${id}: unknown evidence type ${JSON.stringify(evidence)}`)
    }
  }
  if (
    !Array.isArray(years) ||
    years.length === 0 ||
    years.some((year) => !Number.isInteger(year))
  ) {
    throw new ManifestError(`dataset ${id}: years must be a non-empty array of integers`)
  }
  const yearList = years as number[]
  const relativePath = optionalPath(path, `dataset ${id}: path`)
  if (relativePath === null) {
    throw new ManifestError(`dataset ${id}: path is required`)
  }

  let defaultYear = yearList[yearList.length - 1] as number
  if (input.defaultYear !== undefined) {
    if (!Number.isInteger(input.defaultYear) || !yearList.includes(input.defaultYear as number)) {
      throw new ManifestError(`dataset ${id}: defaultYear must be one of the listed years`)
    }
    defaultYear = input.defaultYear as number
  }

  let yearGeographyCounts: number[] | null = null
  if (input.yearGeographyCounts !== undefined) {
    const counts = input.yearGeographyCounts
    if (
      !Array.isArray(counts) ||
      counts.length !== yearList.length ||
      counts.some((count) => !Number.isInteger(count) || (count as number) < 0)
    ) {
      throw new ManifestError(
        `dataset ${id}: yearGeographyCounts must align with years and be non-negative integers`,
      )
    }
    yearGeographyCounts = counts as number[]
  }

  return {
    id,
    title,
    metric,
    metricTitle,
    energySource,
    sourceId,
    datasetVersion,
    evidenceTypes: evidenceTypes as EvidenceType[],
    years: yearList,
    path: relativePath,
    unit,
    defaultYear,
    yearGeographyCounts,
  }
}

export function parseManifest(input: unknown): DataManifest {
  if (!isRecord(input)) {
    throw new ManifestError("Manifest is not an object")
  }
  const schemaVersion = requireString(input.schemaVersion, "Manifest schemaVersion")
  if (typeof input.generatedAt !== "string" || Number.isNaN(Date.parse(input.generatedAt))) {
    throw new ManifestError("Manifest generatedAt must be an ISO date string")
  }
  if (!Array.isArray(input.datasets)) {
    throw new ManifestError("Manifest datasets must be an array")
  }
  const datasets = input.datasets.map(parseDataset)
  const seen = new Set<string>()
  for (const dataset of datasets) {
    if (seen.has(dataset.id)) {
      throw new ManifestError(`Duplicate dataset id ${dataset.id}`)
    }
    seen.add(dataset.id)
  }
  return {
    schemaVersion,
    generatedAt: input.generatedAt,
    datasets,
    countriesGeojsonPath: optionalPath(input.countriesGeojsonPath, "countriesGeojsonPath"),
    geographyIndexPath: optionalPath(input.geographyIndexPath, "geographyIndexPath"),
    countrySeriesPathTemplate: optionalPath(
      input.countrySeriesPathTemplate,
      "countrySeriesPathTemplate",
    ),
    worldSeriesPath: optionalPath(input.worldSeriesPath, "worldSeriesPath"),
  }
}

export const DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`
export const MANIFEST_URL = `${DATA_BASE_URL}manifest.json`

export async function loadManifest(url: string = MANIFEST_URL): Promise<DataManifest> {
  // The manifest is the mutable entry point to otherwise cacheable data:
  // always revalidate it so a redeploy can't leave the app pinned to a stale
  // dataset listing (GitHub Pages caches for ~10 minutes).
  const response = await fetch(url, { cache: "no-cache" })
  if (!response.ok) {
    throw new ManifestError(`Manifest request failed with status ${response.status}`)
  }
  return parseManifest(await response.json())
}
