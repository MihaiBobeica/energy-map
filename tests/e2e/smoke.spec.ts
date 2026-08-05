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

  // UN estimates end in 2023, so the default year 2024 is already backed by a
  // medium-variant projection. The value is shown, but the rail must say the
  // denominator is a different kind of number.
  await expect(page.getByTestId("year-value")).toHaveText("2024")
  await expect(page.locator(".rail")).toContainText("projected population")
  await expect(page.locator(".rail")).toContainText("UN projection, not an estimate")

  // Step back into the estimated span and the wording must change with it.
  await page.getByRole("button", { name: "Previous year" }).click()
  await expect(page.getByTestId("year-value")).toHaveText("2023")
  await expect(page.locator(".rail")).toContainText("reconstructed population")
  await expect(page.locator(".rail")).not.toContainText("UN projection")
})

test("per capita reaches the final electricity year", async ({ page }) => {
  await page.goto("./?metric=electricity-generation&basis=per-capita&year=2025&country=NOR")
  await expect(page.getByRole("radio", { name: "Per capita" })).toBeChecked()
  await expect(page.getByTestId("year-value")).toHaveText("2025")
  // A real value, not a blank map: the projection supplies the denominator.
  await expect(page.locator(".country-panel")).toContainText("kWh per person")
  await expect(page.locator(".country-panel")).toContainText("UN projection, not an estimate")
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
