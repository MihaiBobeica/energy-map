#!/usr/bin/env node
/**
 * Zero-dependency static server for dist/, used as the Playwright webServer.
 *
 * `vite preview` is an SPA server: it answers ANY unmatched path with
 * index.html and HTTP 200. GitHub Pages answers 404. That difference makes
 * every missing-asset bug structurally invisible to the e2e suite, which is
 * how a 404 on assets/maplibre-gl-worker.mjs shipped green.
 *
 * This server mirrors GitHub Pages project-page behaviour:
 *   - files are served from dist/ under BASE (default /energy-map/)
 *   - directories resolve to index.html
 *   - anything else is a real 404 with 404.html or a plain body
 *
 * Usage: node scripts/serve-dist.mjs [--port 4173] [--dist dist] [--base /energy-map/]
 */
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import process from "node:process"

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const PORT = Number(arg("port", process.env.PORT ?? 4173))
const DIST = path.resolve(arg("dist", "dist"))
const BASE = arg("base", "/energy-map/")

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".pmtiles": "application/octet-stream",
}

async function resolveFile(urlPath) {
  if (!urlPath.startsWith(BASE)) return null
  const relative = decodeURIComponent(urlPath.slice(BASE.length).split("?")[0])
  if (relative.includes("\0")) return null
  const candidate = path.resolve(DIST, relative)
  if (candidate !== DIST && !candidate.startsWith(DIST + path.sep)) return null // traversal
  try {
    const info = await stat(candidate)
    if (info.isDirectory()) {
      const index = path.join(candidate, "index.html")
      return (await stat(index)).isFile() ? index : null
    }
    return info.isFile() ? candidate : null
  } catch {
    return null
  }
}

const server = http.createServer((request, response) => {
  const urlPath = (request.url ?? "/").split("?")[0]
  if (urlPath === BASE.replace(/\/$/, "")) {
    response.writeHead(301, { Location: BASE })
    response.end()
    return
  }
  void resolveFile(urlPath).then((file) => {
    if (!file) {
      // Exactly what GitHub Pages does for an unknown path.
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      response.end(`404 Not Found: ${urlPath}\n`)
      return
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    })
    createReadStream(file).pipe(response)
  })
})

server.listen(PORT, () => {
  console.log(`serve-dist: ${DIST} on http://localhost:${PORT}${BASE} (strict 404s)`)
})
