export const EVIDENCE_TYPES = [
  "observed",
  "reconstructed",
  "allocated",
  "proxy",
  "missing",
] as const

export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  observed: "Observed",
  reconstructed: "Reconstructed",
  allocated: "Allocated (estimated spatial allocation of an observed parent total)",
  proxy: "Proxy indicator",
  missing: "No defensible value",
}

export function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === "string" && (EVIDENCE_TYPES as readonly string[]).includes(value)
}
