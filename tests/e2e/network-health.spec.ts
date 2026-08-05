import { expect, test } from "@playwright/test"

/**
 * A static site has no server-side error channel: a missing asset is a silent
 * 404 that the UI never mentions. This test makes every failed request during
 * a normal session a hard CI failure.
 *
 * The only tolerated 404 is country-series/<ISO3>.json, which the loader
 * deliberately treats as "this geography has no series" (see loaders.ts).
 */
const TOLERATED = [/\/data\/country-series\/[A-Z]{3}\.json/]

function tolerated(url: string): boolean {
  return TOLERATED.some((pattern) => pattern.test(url))
}

test("no failed or 4xx/5xx requests during a normal session", async ({ page }) => {
  const problems: string[] = []

  page.on("requestfailed", (request) => {
    if (!tolerated(request.url())) {
      problems.push(`FAILED ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`)
    }
  })
  page.on("response", (response) => {
    if (response.status() >= 400 && !tolerated(response.url())) {
      problems.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))

  await page.goto("./")
  await expect(page.locator(".map-container canvas")).toBeVisible()

  // Exercise the interactions that pull in the rest of the asset/data graph.
  await page.getByRole("combobox", { name: "Metric" }).selectOption("electricity-demand")
  await expect(page).toHaveURL(/metric=electricity-demand/)
  await page.getByRole("button", { name: "Previous year" }).click()
  await expect(page).toHaveURL(/year=2023/)
  // Deliberately not networkidle: MapLibre keeps a worker channel open, so
  // networkidle never settles. A short settle is enough for the fetches the
  // interactions above trigger.
  await page.waitForTimeout(1_500)

  expect(problems, "requests failed while the page still looked healthy").toEqual([])
})
