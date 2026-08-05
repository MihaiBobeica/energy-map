import { describe, expect, it } from "vitest"

import { EVIDENCE_LABELS, EVIDENCE_TYPES, isEvidenceType } from "./evidence.ts"

describe("evidence classifications", () => {
  it("defines exactly the five required classifications", () => {
    expect(EVIDENCE_TYPES).toEqual(["observed", "reconstructed", "allocated", "proxy", "missing"])
  })

  it("has a human-readable label for every classification", () => {
    for (const evidence of EVIDENCE_TYPES) {
      expect(EVIDENCE_LABELS[evidence]).toBeTruthy()
    }
  })

  it("labels allocated values as estimates, never as observations", () => {
    expect(EVIDENCE_LABELS.allocated.toLowerCase()).toContain("estimated")
    expect(EVIDENCE_LABELS.allocated.toLowerCase()).not.toMatch(/^observed/)
  })

  it("accepts valid evidence types and rejects everything else", () => {
    expect(isEvidenceType("observed")).toBe(true)
    expect(isEvidenceType("proxy")).toBe(true)
    expect(isEvidenceType("estimated")).toBe(false)
    expect(isEvidenceType("")).toBe(false)
    expect(isEvidenceType(null)).toBe(false)
    expect(isEvidenceType(42)).toBe(false)
  })
})
