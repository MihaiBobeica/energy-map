import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LineChart, type ChartSeries } from "./LineChart.tsx"

const series = (points: [number, number][], emphasized = true): ChartSeries[] => [
  { id: "s", label: "Generation", points, emphasized },
]

function chart(...args: Parameters<typeof LineChart>) {
  const { container } = render(<LineChart {...args[0]} />)
  return container.querySelector("svg")!
}

describe("LineChart", () => {
  it("renders nothing when no series has any point", () => {
    const { container } = render(<LineChart series={series([])} unit="TWh" />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("draws a point that a polyline would swallow", () => {
    // A one-year history used to render an invisible polyline, which read as
    // "no history" rather than "one year of history".
    const svg = chart({ series: series([[2024, 42]]), unit: "TWh" })
    expect(svg.querySelectorAll("circle")).toHaveLength(1)
    expect(svg.querySelector("polyline")).toBeNull()
  })

  it("fits the axis close to the data instead of rounding far past it", () => {
    // 561 used to produce a 1000 axis, leaving the line flat in the lower half.
    const svg = chart({
      series: series([
        [2000, 520],
        [2024, 561],
      ]),
      unit: "TWh",
    })
    const ticks = [...svg.querySelectorAll("text")].map((node) => node.textContent)
    expect(ticks).toContain("600")
    expect(ticks).not.toContain("1k")
  })

  it("marks the selected year only where the series actually has a value", () => {
    const points: [number, number][] = [
      [2000, 10],
      [2024, 20],
    ]
    const marked = chart({ series: series(points), unit: "TWh", markerYear: 2024 })
    expect(marked.querySelectorAll("circle").length).toBeGreaterThan(0)

    // 2010 is not in the series; a marker there would imply a value that was
    // never reported.
    const unmarked = chart({ series: series(points), unit: "TWh", markerYear: 2010 })
    expect(unmarked.querySelectorAll("circle")).toHaveLength(0)
  })

  it("describes the range for screen readers, not just the point count", () => {
    const svg = chart({
      series: series([
        [2000, 100],
        [2024, 250],
      ]),
      unit: "TWh",
    })
    const label = svg.getAttribute("aria-label") ?? ""
    expect(label).toContain("TWh")
    expect(label).toContain("100 in 2000")
    expect(label).toContain("250 in 2024")
  })

  it("keeps every value inside the plot area", () => {
    const svg = chart({
      series: series([
        [2000, 1],
        [2012, 9999],
        [2024, 5000],
      ]),
      unit: "TWh",
    })
    const coords = (svg.querySelector("polyline")!.getAttribute("points") ?? "")
      .split(" ")
      .map((pair) => pair.split(",").map(Number))
    for (const [, cy] of coords) {
      expect(cy!).toBeGreaterThanOrEqual(0)
      expect(cy!).toBeLessThanOrEqual(160)
    }
  })
})
