import { isEvidenceType, type EvidenceType } from "../domain/evidence.ts"

export type ManifestDataset = {
  id: string
  title: string
  metric: string
  sourceId: string
  datasetVersion: string
  evidenceTypes: EvidenceType[]
  years: number[]
  path: string
}

export type DataManifest = {
  schemaVersion: string
  generatedAt: string
  datasets: ManifestDataset[]
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

function parseDataset(input: unknown, index: number): ManifestDataset {
  if (!isRecord(input)) {
    throw new ManifestError(`datasets[${index}] is not an object`)
  }
  const { id, title, metric, sourceId, datasetVersion, evidenceTypes, years, path } = input
  if (typeof id !== "string" || id === "") {
    throw new ManifestError(`datasets[${index}].id must be a non-empty string`)
  }
  if (typeof title !== "string" || title === "") {
    throw new ManifestError(`dataset ${id}: title must be a non-empty string`)
  }
  if (typeof metric !== "string" || metric === "") {
    throw new ManifestError(`dataset ${id}: metric must be a non-empty string`)
  }
  if (typeof sourceId !== "string" || sourceId === "") {
    throw new ManifestError(`dataset ${id}: sourceId must be a non-empty string`)
  }
  if (typeof datasetVersion !== "string" || datasetVersion === "") {
    throw new ManifestError(`dataset ${id}: datasetVersion must be a non-empty string`)
  }
  if (!Array.isArray(evidenceTypes) || evidenceTypes.length === 0) {
    throw new ManifestError(`dataset ${id}: evidenceTypes must be a non-empty array`)
  }
  for (const evidence of evidenceTypes) {
    if (!isEvidenceType(evidence)) {
      throw new ManifestError(`dataset ${id}: unknown evidence type ${JSON.stringify(evidence)}`)
    }
  }
  if (!Array.isArray(years) || years.some((year) => !Number.isInteger(year))) {
    throw new ManifestError(`dataset ${id}: years must be an array of integers`)
  }
  if (typeof path !== "string" || path === "") {
    throw new ManifestError(`dataset ${id}: path must be a non-empty string`)
  }
  if (path.startsWith("/") || path.includes("..")) {
    throw new ManifestError(`dataset ${id}: path must be relative to the data root`)
  }
  return {
    id,
    title,
    metric,
    sourceId,
    datasetVersion,
    evidenceTypes: evidenceTypes as EvidenceType[],
    years: years as number[],
    path,
  }
}

export function parseManifest(input: unknown): DataManifest {
  if (!isRecord(input)) {
    throw new ManifestError("Manifest is not an object")
  }
  if (typeof input.schemaVersion !== "string" || input.schemaVersion === "") {
    throw new ManifestError("Manifest schemaVersion must be a non-empty string")
  }
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
    schemaVersion: input.schemaVersion,
    generatedAt: input.generatedAt,
    datasets,
  }
}

export const MANIFEST_URL = `${import.meta.env.BASE_URL}data/manifest.json`

export async function loadManifest(url: string = MANIFEST_URL): Promise<DataManifest> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new ManifestError(`Manifest request failed with status ${response.status}`)
  }
  return parseManifest(await response.json())
}
