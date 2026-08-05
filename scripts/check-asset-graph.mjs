#!/usr/bin/env node
/**
 * Fails the build when the emitted bundle references an asset that was never
 * emitted into dist/.
 *
 * Walks the reachable asset graph from dist/index.html and resolves every
 * reference it can see:
 *   - HTML  : src=/href= on <script>, <link>, <img>
 *   - CSS   : url(...)
 *   - JS    : static + dynamic import specifiers, base-path-absolute literals,
 *             and *sibling-module literals* — the `new URL("./x.mjs",
 *             import.meta.url)` side-loading pattern that bundlers cannot
 *             statically follow (MapLibre's parsing worker, wasm blobs, ...).
 * The walk is transitive: a copied worker whose own `import` of a shared chunk
 * is missing fails too.
 *
 * Usage: node scripts/check-asset-graph.mjs [distDir] [basePath]
 */
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const DIST = path.resolve(process.argv[2] ?? "dist")
const BASE = process.argv[3] ?? "/energy-map/"

/**
 * References that are provably unreachable in a production bundle. Every entry
 * needs a reason; unused entries are reported so they cannot rot silently.
 */
const ALLOWED_MISSING = [
  {
    pattern: /^maplibre-gl-worker(-dev)?\.mjs$/,
    reason:
      "MapLibre's built-in worker-URL guess (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`) is dead code here: src/map/maplibreWorker.ts calls setWorkerUrl() with the hashed worker asset Vite emits, before any Map is constructed. The live worker reference IS checked — see the assertion below. The -dev variant is additionally unreachable in a production chunk.",
  },
]

/**
 * The worker is the one asset whose absence is invisible at runtime (MapLibre
 * attaches no error handler to the Worker and its actor has no timeout, so a
 * 404 hangs forever with a clean console). Assert it positively rather than
 * relying on reference-walking, because we deliberately allowlist MapLibre's
 * unused built-in guess above.
 */
const REQUIRED_GLOBS = [
  {
    dir: "assets",
    pattern: /^maplibre-gl-worker-[A-Za-z0-9_-]+\.js$/,
    what: "the bundled MapLibre parsing worker (src/map/maplibreWorker.ts)",
  },
]

const SCRIPT_EXT = new Set([".js", ".mjs", ".cjs"])
const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".cjs"])

const errors = []
const allowlistHits = new Set()

async function isFile(candidate) {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

/** Collects references out of one file, as { spec, resolved } pairs. */
function collectRefs(content, ext, fileDir) {
  const refs = []
  const add = (spec, resolvedAbs) => refs.push({ spec, resolved: resolvedAbs })

  const resolveWebPath = (spec) => {
    if (
      !spec ||
      /^(?:[a-z]+:)?\/\//i.test(spec) ||
      spec.startsWith("data:") ||
      spec.startsWith("blob:") ||
      spec.startsWith("#") ||
      spec.startsWith("mailto:")
    ) {
      return null
    }
    if (spec.startsWith(BASE)) return path.join(DIST, spec.slice(BASE.length).split("?")[0])
    if (spec.startsWith("/")) return path.join(DIST, spec.slice(1).split("?")[0])
    return path.join(fileDir, spec.split("?")[0])
  }

  if (ext === ".html") {
    for (const m of content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const resolved = resolveWebPath(m[1])
      if (resolved) add(m[1], resolved)
    }
  }

  if (ext === ".css") {
    for (const m of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const resolved = resolveWebPath(m[1])
      if (resolved) add(m[1], resolved)
    }
  }

  if (SCRIPT_EXT.has(ext)) {
    // Static and dynamic import specifiers that are relative or base-absolute.
    for (const m of content.matchAll(
      /(?:\bfrom|\bimport)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+|\/[^"'`]+)["'`]/g,
    )) {
      const resolved = resolveWebPath(m[1])
      if (resolved) add(m[1], resolved)
    }
    // Any literal that points at the deployed base path.
    for (const m of content.matchAll(
      new RegExp(`["'\`](${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"'\`]*)["'\`]`, "g"),
    )) {
      const spec = m[1]
      // Data files are verified separately by verify-data.mjs; template
      // literals ({iso3}) are not concrete paths.
      if (spec.includes("{") || spec.endsWith("/")) continue
      const resolved = resolveWebPath(spec)
      if (resolved) add(spec, resolved)
    }
    // Sibling-module side-loading: `new URL("./maplibre-gl-worker.mjs", import.meta.url)`.
    // Bundlers do not emit these, so they are exactly the class of reference
    // that 404s at runtime while the build stays green.
    for (const m of content.matchAll(
      /["'`]((?:\.\/)?[A-Za-z0-9_][A-Za-z0-9._-]*\.(?:mjs|wasm))["'`]/g,
    )) {
      const bare = m[1].replace(/^\.\//, "")
      add(m[1], path.join(fileDir, bare))
    }
  }

  return refs
}

async function main() {
  const entry = path.join(DIST, "index.html")
  if (!(await isFile(entry))) {
    errors.push(`dist entry ${entry} does not exist — did the build run?`)
    return
  }

  const queue = [entry]
  const visited = new Set()

  while (queue.length > 0) {
    const file = queue.shift()
    if (visited.has(file)) continue
    visited.add(file)

    const ext = path.extname(file).toLowerCase()
    if (!TEXT_EXT.has(ext)) continue

    const content = await readFile(file, "utf8")
    const refs = collectRefs(content, ext, path.dirname(file))

    for (const { spec, resolved } of refs) {
      const relativeToDist = path.relative(DIST, resolved)
      if (relativeToDist.startsWith("..")) {
        errors.push(`${path.relative(DIST, file)} references ${spec} which escapes dist/`)
        continue
      }
      if (await isFile(resolved)) {
        queue.push(resolved)
        continue
      }
      const allowed = ALLOWED_MISSING.find((rule) => rule.pattern.test(path.basename(resolved)))
      if (allowed) {
        allowlistHits.add(allowed.pattern.source)
        continue
      }
      errors.push(
        `${path.relative(DIST, file)} references ${spec} -> ${relativeToDist.replaceAll(
          "\\",
          "/",
        )} which was never emitted into dist/`,
      )
    }
  }

  for (const required of REQUIRED_GLOBS) {
    const directory = path.join(DIST, required.dir)
    let entries = []
    try {
      entries = await readdir(directory)
    } catch {
      errors.push(`${required.dir}/ does not exist — expected ${required.what}`)
      continue
    }
    if (!entries.some((entry) => required.pattern.test(entry))) {
      errors.push(
        `no file matching ${required.pattern} in ${required.dir}/ — expected ${required.what}`,
      )
    }
  }

  console.log(`Asset graph: walked ${visited.size} reachable files under ${DIST}.`)
  for (const rule of ALLOWED_MISSING) {
    if (!allowlistHits.has(rule.pattern.source)) {
      console.warn(`NOTE: allowlist entry ${rule.pattern} is no longer needed — remove it.`)
    }
  }
}

await main()

if (errors.length > 0) {
  console.error(`Asset-graph check FAILED for ${DIST}:`)
  for (const error of new Set(errors)) console.error(`  - ${error}`)
  console.error(
    "\nA referenced asset is missing from the build output. It will 404 at runtime, " +
      "usually with no console error and no visible failure.",
  )
  process.exit(1)
}
console.log(`Asset-graph check passed for ${DIST}.`)
