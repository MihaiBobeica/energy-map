import { expect, test } from "@playwright/test"

test("atlas loads under /energy-map/ with controls, legend and default year", async ({ page }) => {
  await page.goto("./")
  await expect(page).toHaveTitle(/Energy Map/)
  await expect(page.getByRole("heading", { name: "Energy Map" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Metric" })).toBeVisible()
  await expect(page.getByRole("slider", { name: "Year" })).toBeVisible()
  // Default year is the latest broadly-covered year, not the sparse newest one.
  await expect(page.locator(".control-card")).toContainText("2024")
  await expect(page.getByLabel("Legend")).toBeVisible()
  await expect(page.getByLabel("Legend")).toContainText("No data")
})

test("map canvas renders, or an explicit fallback message is shown", async ({ page }) => {
  await page.goto("./")
  const canvas = page.locator(".map-container canvas")
  const fallback = page.locator(".map-fallback")
  await expect(canvas.or(fallback).first()).toBeVisible()
})

test("metric and year changes update the shareable URL", async ({ page }) => {
  await page.goto("./")
  await page.getByRole("combobox", { name: "Metric" }).selectOption("electricity-demand")
  await expect(page).toHaveURL(/metric=electricity-demand/)

  await page.getByRole("button", { name: "Previous year" }).click()
  await expect(page).toHaveURL(/year=2023/)
})

test("URL state restores metric, year and selected country on load", async ({ page }) => {
  await page.goto("./?metric=electricity-demand&year=1995&country=NLD")
  const select = page.getByRole("combobox", { name: "Metric" })
  await expect(select).toHaveValue("electricity-demand")
  await expect(page.locator(".control-card")).toContainText("1995")
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
