import { expect, test, type Page } from "@playwright/test"

import { BUCKET_COLORS, MISSING_COLOR } from "../../src/utils/scale.ts"

/**
 * The map is a WebGL canvas, so "did anything render?" cannot be answered from
 * the DOM: a canvas element stays visible and correctly sized even when zero
 * geometry is drawn. These tests read the actual composited pixels.
 *
 * Chromium decodes the screenshot for us (no image dependency in Node), and we
 * mask out every DOM overlay drawn on top of the map — critically the legend,
 * whose swatches use the exact same palette as the choropleth.
 */

const BACKGROUND_COLOR = "#a8c2d4" // NEUTRAL_STYLE background layer
const CHOROPLETH_COLORS = [MISSING_COLOR, ...BUCKET_COLORS]

/** Overlays painted above the canvas; their pixels are not map output. */
const OVERLAY_SELECTORS = [
  ".control-card",
  ".legend",
  ".country-panel",
  ".map-tooltip",
  ".data-error",
  ".maplibregl-ctrl",
  ".maplibregl-ctrl-attrib",
]

type Rect = { x: number; y: number; width: number; height: number }
type MapPixels = {
  sampled: number
  backgroundFraction: number
  choroplethFraction: number
  distinctBucketColors: number
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * Screenshots the map region, hands the PNG back to the page for decoding, and
 * classifies pixels against the known palette. Colour comparison uses a small
 * per-channel tolerance so GPU/colour-profile rounding cannot make it flaky;
 * the palette entries are far further apart than the tolerance.
 */
async function sampleMapPixels(page: Page): Promise<MapPixels> {
  const container = page.locator(".map-container")
  const box = await container.boundingBox()
  if (!box) throw new Error(".map-container has no layout box")

  const overlays: Rect[] = await page.evaluate((selectors) => {
    const rects: Rect[] = []
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        }
      }
    }
    return rects
  }, OVERLAY_SELECTORS)

  const png = await page.screenshot({ clip: box })

  return page.evaluate(
    async ({ dataUrl, box: clip, overlays: masks, palette, background, tolerance }) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("2d context unavailable")
      context.drawImage(bitmap, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

      // Screenshot pixels are device pixels; map back to CSS pixels to compare
      // against getBoundingClientRect values.
      const scaleX = canvas.width / clip.width
      const scaleY = canvas.height / clip.height

      const near = (r: number, g: number, b: number, target: number[]) =>
        Math.abs(r - target[0]!) <= tolerance &&
        Math.abs(g - target[1]!) <= tolerance &&
        Math.abs(b - target[2]!) <= tolerance

      let sampled = 0
      let backgroundHits = 0
      let choroplethHits = 0
      const bucketsSeen = new Set<number>()

      // Sample on a grid: full-resolution scanning is unnecessary and slow.
      const step = 3
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const cssX = clip.x + x / scaleX
          const cssY = clip.y + y / scaleY
          const masked = masks.some(
            (m) =>
              cssX >= m.x - 2 &&
              cssX <= m.x + m.width + 2 &&
              cssY >= m.y - 2 &&
              cssY <= m.y + m.height + 2,
          )
          if (masked) continue

          const offset = (y * canvas.width + x) * 4
          const r = data[offset]!
          const g = data[offset + 1]!
          const b = data[offset + 2]!
          sampled += 1
          if (near(r, g, b, background)) backgroundHits += 1
          for (let index = 0; index < palette.length; index += 1) {
            if (near(r, g, b, palette[index]!)) {
              choroplethHits += 1
              // index 0 is the missing colour; 1.. are the value buckets.
              if (index > 0) bucketsSeen.add(index)
              break
            }
          }
        }
      }

      return {
        sampled,
        backgroundFraction: sampled === 0 ? 1 : backgroundHits / sampled,
        choroplethFraction: sampled === 0 ? 0 : choroplethHits / sampled,
        distinctBucketColors: bucketsSeen.size,
      }
    },
    {
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      box,
      overlays,
      palette: CHOROPLETH_COLORS.map(hexToRgb),
      background: hexToRgb(BACKGROUND_COLOR),
      tolerance: 8,
    },
  )
}

test.describe("map actually renders geometry", () => {
  test("country geometry is painted, not just an empty background", async ({ page }) => {
    const failedRequests: string[] = []
    page.on("requestfailed", (request) =>
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`),
    )
    page.on("response", (response) => {
      // country-series/*.json legitimately 404s for geographies with no series.
      if (response.status() >= 400 && !response.url().includes("/country-series/")) {
        failedRequests.push(`${response.status()} ${response.url()}`)
      }
    })

    await page.goto("./")
    await expect(page.locator(".map-container canvas")).toBeVisible()

    // Poll rather than sleep: the worker parses 1.7 MB of GeoJSON into tiles
    // before the first geometry frame, and that timing varies in CI.
    await expect
      .poll(async () => (await sampleMapPixels(page)).choroplethFraction, {
        timeout: 20_000,
        intervals: [500, 500, 1000, 1000, 2000],
        message: "map never painted any country geometry (blank map)",
      })
      .toBeGreaterThan(0.05)

    const pixels = await sampleMapPixels(page)

    // Ocean/background must not be the whole picture.
    expect(pixels.backgroundFraction, "background dominates the map region").toBeLessThan(0.85)

    // More than one bucket colour proves feature-state values were joined and
    // painted — not merely that outlines/geometry exist in the missing colour.
    expect(
      pixels.distinctBucketColors,
      "geometry rendered but no data values were painted (broken id join?)",
    ).toBeGreaterThanOrEqual(3)

    // No asset or data request may fail while the UI still looks fine.
    expect(failedRequests, "failed network requests during map load").toEqual([])
  })

  test("changing the year repaints the choropleth", async ({ page }) => {
    await page.goto("./?metric=electricity-generation&year=2024")
    await expect
      .poll(async () => (await sampleMapPixels(page)).distinctBucketColors, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(3)
    const before = await sampleMapPixels(page)

    await page.goto("./?metric=electricity-generation&year=2000")
    await expect
      .poll(async () => (await sampleMapPixels(page)).distinctBucketColors, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(3)
    const after = await sampleMapPixels(page)

    // Two different years must not produce an identical colour distribution;
    // this catches "values never reach the map" regressions where the first
    // paint works but updates silently no-op.
    expect(Math.abs(after.choroplethFraction - before.choroplethFraction)).toBeGreaterThan(0)
  })
})
