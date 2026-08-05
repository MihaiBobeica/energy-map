import type { EvidenceType } from "./evidence.ts"

export type GeographyType =
  "world" | "country" | "admin1" | "admin2" | "urban-centre" | "grid-cell" | "plant"

export type ConfidenceLevel = "high" | "medium" | "low" | null

export type Geography = {
  id: string
  name: string
  type: GeographyType
  parentId: string | null
  iso3: string | null
  sourceGeometryId: string
  geometryVersion: string
  validFrom: number | null
  validTo: number | null
}

export type EnergyObservation = {
  geographyId: string
  year: number
  metric: string
  energySource: string | null
  value: number | null
  unit: string
  evidenceType: EvidenceType
  confidence: ConfidenceLevel
  lowerBound: number | null
  upperBound: number | null
  sourceId: string
  methodologyId: string | null
  datasetVersion: string
  processingVersion: string
}

export type DataSource = {
  id: string
  name: string
  publisher: string
  url: string
  licence: string
  licenceUrl: string | null
  retrievedAt: string
  temporalCoverage: string
  geographicCoverage: string
  updateFrequency: string | null
  notes: string[]
}

export type Methodology = {
  id: string
  name: string
  version: string
  description: string
  inputs: string[]
  assumptions: string[]
  limitations: string[]
  validationMetrics: Record<string, number | string>
}

export type CoverageRecord = {
  metric: string
  geographyType: GeographyType
  firstYear: number
  lastYear: number
  observationCount: number
  geographyCount: number
  evidenceTypes: EvidenceType[]
}
