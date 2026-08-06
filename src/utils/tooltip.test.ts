import { describe, expect, it } from "vitest"

import { placeTooltip, TOOLTIP_MAX_HEIGHT, TOOLTIP_MAX_WIDTH } from "./tooltip.ts"

/** Asserts the tooltip's whole estimated box lands inside the viewport. */
function expectOnScreen(
  placed: { left: number; top: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  expect(placed.left).toBeGreaterThanOrEqual(0)
  expect(placed.top).toBeGreaterThanOrEqual(0)
  expect(placed.left + TOOLTIP_MAX_WIDTH).toBeLessThanOrEqual(viewportWidth)
  expect(placed.top + TOOLTIP_MAX_HEIGHT).toBeLessThanOrEqual(viewportHeight)
}

describe("placeTooltip", () => {
  it("sits after the pointer when there is room", () => {
    const placed = placeTooltip(700, 400, 1280, 800)
    expect(placed.left).toBeGreaterThan(700)
    expect(placed.top).toBeGreaterThan(400)
    expectOnScreen(placed, 1280, 800)
  })

  it("moves to the near side of the pointer at the far edge", () => {
    const placed = placeTooltip(1200, 760, 1280, 800)
    expect(placed.left + TOOLTIP_MAX_WIDTH).toBeLessThan(1200)
    expect(placed.top + TOOLTIP_MAX_HEIGHT).toBeLessThan(760)
    expectOnScreen(placed, 1280, 800)
  })

  it("stays on screen on a phone, where neither side has room", () => {
    // The old rule flipped whenever x > width - 260. On a 390px screen that is
    // 130px, so almost every pointer threw a 232px tooltip off the left edge.
    for (let x = 0; x <= 390; x += 10) {
      for (const y of [0, 120, 400, 700, 844]) {
        expectOnScreen(placeTooltip(x, y, 390, 844), 390, 844)
      }
    }
  })

  it("stays on screen across a sweep of desktop positions", () => {
    for (let x = 0; x <= 1280; x += 40) {
      for (let y = 0; y <= 800; y += 40) {
        expectOnScreen(placeTooltip(x, y, 1280, 800), 1280, 800)
      }
    }
  })

  it("pins to the near edge rather than inverting when the viewport is tiny", () => {
    // Narrower than the tooltip itself: it cannot fit, but it must not be
    // placed at a negative offset either.
    const placed = placeTooltip(100, 50, 200, 150)
    expect(placed.left).toBeGreaterThanOrEqual(0)
    expect(placed.top).toBeGreaterThanOrEqual(0)
  })
})
