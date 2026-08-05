import { expect, test } from "@playwright/test"

test("application shell loads under /energy-map/", async ({ page }) => {
  await page.goto("./")
  await expect(page).toHaveTitle(/Energy Map/)
  await expect(page.getByRole("heading", { name: "Energy Map" })).toBeVisible()
  await expect(page.getByRole("status")).toContainText(/Application shell deployed|dataset/)
  await expect(page.getByRole("contentinfo")).toContainText("Data sources")
})

test("map canvas renders, or an explicit fallback message is shown", async ({ page }) => {
  await page.goto("./")
  const canvas = page.locator(".map-container canvas")
  const fallback = page.locator(".map-fallback")
  await expect(canvas.or(fallback).first()).toBeVisible()
})
