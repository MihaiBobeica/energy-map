import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// jsdom has no WebGL; pretend it exists so the map shell mounts in tests.
// (MapLibre itself is mocked in component tests.)
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => ({}),
) as unknown as HTMLCanvasElement["getContext"]

// jsdom implements no media queries at all. This answers the two the app asks
// against window.innerWidth, so a test acts like a phone simply by setting a
// narrow width: a narrow viewport stands in for a touch screen here, which is
// a simplification (a narrow desktop window has a mouse) but keeps the tests
// to one dial.
window.matchMedia = ((query: string) => {
  const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(query)
  const matches = maxWidth
    ? window.innerWidth <= Number(maxWidth[1])
    : query.includes("hover: hover")
      ? window.innerWidth > 640
      : false
  return {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}) as unknown as typeof window.matchMedia

afterEach(() => {
  cleanup()
})
