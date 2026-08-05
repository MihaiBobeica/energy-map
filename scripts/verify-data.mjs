#!/usr/bin/env node
/**
 * Verifies the integrity of the static data directory:
 *  - manifest.json exists, parses, and has the expected shape
 *  - every dataset path referenced by the manifest exists
 *  - if checksums.json exists, every listed file matches its SHA-256
 *
 * Usage: node scripts/verify-data.mjs [dataRoot]   (default: public/data)
 */
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const dataRoot = path.resolve(process.argv[2] ?? "public/data")
const errors = []

async function exists(candidate) {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

async function main() {
  const manifestPath = path.join(dataRoot, "manifest.json")
  if (!(await exists(manifestPath))) {
    errors.push(`manifest.json not found at ${manifestPath}`)
    return
  }

  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  } catch (error) {
    errors.push(`manifest.json is not valid JSON: ${error.message}`)
    return
  }

  if (typeof manifest.schemaVersion !== "string" || manifest.schemaVersion === "") {
    errors.push("manifest.schemaVersion must be a non-empty string")
  }
  if (typeof manifest.generatedAt !== "string" || Number.isNaN(Date.parse(manifest.generatedAt))) {
    errors.push("manifest.generatedAt must be an ISO date string")
  }
  if (!Array.isArray(manifest.datasets)) {
    errors.push("manifest.datasets must be an array")
    return
  }

  for (const dataset of manifest.datasets) {
    if (typeof dataset.path !== "string" || dataset.path === "") {
      errors.push(`dataset ${dataset.id ?? "<no id>"}: missing path`)
      continue
    }
    if (dataset.path.startsWith("/") || dataset.path.includes("..")) {
      errors.push(`dataset ${dataset.id}: path must stay inside the data root`)
      continue
    }
    if (!(await exists(path.join(dataRoot, dataset.path)))) {
      errors.push(`dataset ${dataset.id}: referenced path ${dataset.path} does not exist`)
    }
  }

  const checksumsPath = path.join(dataRoot, "checksums.json")
  if (await exists(checksumsPath)) {
    let checksums
    try {
      checksums = JSON.parse(await readFile(checksumsPath, "utf8"))
    } catch (error) {
      errors.push(`checksums.json is not valid JSON: ${error.message}`)
      return
    }
    for (const [relative, expected] of Object.entries(checksums)) {
      const filePath = path.join(dataRoot, relative)
      if (!(await exists(filePath))) {
        errors.push(`checksums.json: listed file ${relative} does not exist`)
        continue
      }
      const digest = createHash("sha256")
        .update(await readFile(filePath))
        .digest("hex")
      if (digest !== expected) {
        errors.push(`checksum mismatch for ${relative}: expected ${expected}, got ${digest}`)
      }
    }
  }
}

await main()

if (errors.length > 0) {
  console.error(`Data verification FAILED for ${dataRoot}:`)
  for (const error of errors) {
    console.error(`  - ${error}`)
  }
  process.exit(1)
}
console.log(`Data verification passed for ${dataRoot}`)
