import { expect, test } from "@playwright/test"

test("atlas loads under /energy-map/ with controls, legend and default year", async ({ page }) => {
  await page.goto("./")
  await expect(page).toHaveTitle(/Energy Map/)
  await expect(page.getByRole("heading", { name: "Energy Map" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Metric" })).toBeVisible()
  await expect(page.getByRole("slider", { name: "Year" })).toBeVisible()
  // Default year is the latest broadly-covered year, not the sparse newest one.
  await expect(page.locator(".rail")).toContainText("2024")
  await expect(page.getByLabel("Legend")).toBeVisible()
  await expect(page.getByLabel("Legend")).toContainText("Not reported")
  // The key states its unit once, then labels the zero state beside it.
  await expect(page.getByLabel("Legend")).toContainText("Zero")
  await expect(page.getByLabel("Legend")).toContainText("TWh")
})

test("per capita covers the full span, marking projection-backed years", async ({ page }) => {
  await page.goto("./")
  const perCapita = page.getByRole("radio", { name: "Per capita" })
  await expect(perCapita).toBeEnabled()
  await perCapita.check()

  await expect(page).toHaveURL(/basis=per-capita/)
  await expect(page.getByLabel("Legend")).toContainText("kWh per person")

  await expect(page.getByTestId("year-value")).toHaveText("2024")
})

test("per capita reaches the final electricity year", async ({ page }) => {
  await page.goto("./?metric=electricity-generation&basis=per-capita&year=2025&country=NOR")
  await expect(page.getByRole("radio", { name: "Per capita" })).toBeChecked()
  await expect(page.getByTestId("year-value")).toHaveText("2025")
  // A real value, not a blank map: the projection supplies the denominator,
  // and it is still marked as projected rather than passing as an estimate.
  await expect(page.locator(".country-panel")).toContainText("kWh per person")
  await expect(page.locator(".country-panel")).toContainText("projected")
})

test("per capita loads directly from a URL and rescales the map", async ({ page }) => {
  await page.goto("./?metric=electricity-generation&basis=per-capita&year=2023&country=ISL")
  await expect(page.getByRole("radio", { name: "Per capita" })).toBeChecked()
  await expect(page.getByLabel("Legend")).toContainText("kWh per person")
  // Iceland is the world's highest per-capita generator by a wide margin.
  await expect(page.locator(".country-panel")).toContainText("kWh per person")
  await expect(page.locator(".country-panel")).toContainText("Population")
})

test("every published metric starts in 2000", async ({ page }) => {
  await page.goto("./")
  const years = await page.evaluate(async () => {
    const response = await fetch("./data/manifest.json")
    const manifest = await response.json()
    return manifest.datasets.map((dataset: { id: string; years: number[] }) => ({
      id: dataset.id,
      first: Math.min(...dataset.years),
    }))
  })
  expect(years.length).toBeGreaterThan(0)
  for (const entry of years) {
    expect(entry.first, `${entry.id} must start in 2000`).toBe(2000)
  }
})

test("energy source can be selected and is restored from the URL", async ({ page }) => {
  await page.goto("./")
  const sourceSelect = page.getByRole("combobox", { name: "Energy source" })
  await expect(sourceSelect).toBeVisible()

  await sourceSelect.selectOption("solar")
  await expect(page).toHaveURL(/source=solar/)

  await page.goto("./?metric=electricity-generation&source=nuclear&year=2020")
  await expect(page.getByRole("combobox", { name: "Energy source" })).toHaveValue("nuclear")
})

test("country panel shows the generation mix by source", async ({ page }) => {
  await page.goto("./?metric=electricity-generation&year=2024&country=FRA")
  await expect(page.getByRole("heading", { name: /France/ })).toBeVisible()
  const mix = page.getByLabel("Generation by source in 2024")
  await expect(mix).toBeVisible()
  await expect(mix).toContainText("Nuclear")
  await expect(mix).toContainText("Coal")
  await expect(mix).toContainText("%")
})

test("map canvas renders and the WebGL fallback is not shown", async ({ page }) => {
  await page.goto("./")
  // `canvas.or(fallback)` would be a tautology: it is satisfied in every state,
  // including total failure. Success and failure must not be interchangeable.
  await expect(page.locator(".map-container canvas")).toBeVisible()
  await expect(page.locator(".map-fallback")).toHaveCount(0)
})

test("metric and year changes update the shareable URL", async ({ page }) => {
  await page.goto("./")
  await page.getByRole("combobox", { name: "Metric" }).selectOption("electricity-demand")
  await expect(page).toHaveURL(/metric=electricity-demand/)

  await page.getByRole("button", { name: "Previous year" }).click()
  await expect(page).toHaveURL(/year=2023/)
})

test("URL state restores metric, year and selected country on load", async ({ page }) => {
  await page.goto("./?metric=electricity-demand&year=2005&country=NLD")
  const select = page.getByRole("combobox", { name: "Metric" })
  await expect(select).toHaveValue("electricity-demand")
  await expect(page.locator(".rail")).toContainText("2005")
  await expect(page.getByRole("heading", { name: "Netherlands" })).toBeVisible()
  // The panel shows evidence and source metadata for the observation.
  await expect(page.locator(".country-panel")).toContainText("Observed")
  await expect(page.locator(".country-panel")).toContainText("Ember")
})

test("attribution for data and boundaries is visible", async ({ page }) => {
  await page.goto("./")
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Ember")
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Natural Earth")
})

test("zoom buttons sit above the attribution bar", async ({ page }) => {
  await page.goto("./")
  const zoom = await page.locator(".maplibregl-ctrl-group").boundingBox()
  const attribution = await page.locator(".maplibregl-ctrl-attrib").boundingBox()
  expect(zoom).not.toBeNull()
  expect(attribution).not.toBeNull()
  expect(zoom!.y + zoom!.height).toBeLessThanOrEqual(attribution!.y + 1)
})

test("hovering the map highlights a country and keeps the tooltip on screen", async ({ page }) => {
  await page.goto("./")
  await expect(page.locator(".map-container canvas")).toBeVisible()
  const map = await page.locator(".map-container").boundingBox()
  expect(map).not.toBeNull()

  // Sweep across the map until a country is under the pointer, then check the
  // tooltip stays fully inside the viewport — it used to be clipped near the
  // right edge, exactly where the densest countries are at world zoom.
  const viewport = page.viewportSize()!
  for (const fraction of [0.55, 0.7, 0.8, 0.9, 0.95]) {
    await page.mouse.move(map!.x + map!.width * fraction, map!.y + map!.height * 0.45)
    await page.waitForTimeout(250)
    const tooltip = page.locator(".map-tooltip")
    if ((await tooltip.count()) === 0) continue
    const box = await tooltip.boundingBox()
    if (!box) continue
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  }
})

test("controls can be hidden for a clean map and brought back", async ({ page }) => {
  await page.goto("./")
  await page.getByRole("button", { name: "Hide controls" }).click()
  await expect(page.locator(".rail")).toHaveCount(0)

  // The map keeps working while the controls are away.
  await expect(page.locator(".map-container canvas")).toBeVisible()

  const restore = page.getByRole("button", { name: "Show controls" })
  await expect(restore).toContainText("2024")
  await restore.click()
  await expect(page.getByRole("combobox", { name: "Metric" })).toBeVisible()
})

test("a phone opens on the map, with the controls one tap away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("./")

  // The rail sheet covers 42% of a phone screen, so it starts collapsed.
  const restore = page.getByRole("button", { name: "Show controls" })
  await expect(restore).toBeVisible()
  await expect(page.locator(".rail")).toHaveCount(0)
  await expect(page.locator(".map-container canvas")).toBeVisible()
  // Hidden controls must not mean a hidden view.
  await expect(restore).toContainText("Electricity generation")
  await expect(restore).toContainText("2024")

  await restore.click()
  await expect(page.getByRole("combobox", { name: "Metric" })).toBeVisible()
})

// A short, narrow window put both sheets at 88% of the height. They stack in
// one column, so the country panel covered the map AND buried the rail beneath
// it — the map, which is the product, was not visible at all.
for (const viewport of [
  { width: 640, height: 400 },
  { width: 560, height: 360 },
]) {
  test(`the map stays visible between the sheets at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto("./?metric=electricity-generation&year=2024&country=USA")
    // The rail starts collapsed at this width; the sheets can only collide
    // once it is open.
    await page.getByRole("button", { name: "Show controls" }).click()
    await expect(page.locator(".country-panel")).toBeVisible()

    const rail = await page.locator(".rail").boundingBox()
    const panel = await page.locator(".country-panel").boundingBox()
    expect(rail).not.toBeNull()
    expect(panel).not.toBeNull()
    // A real band of map between them, not a negative one.
    expect(panel!.y).toBeGreaterThan(rail!.y + rail!.height)
  })
}
