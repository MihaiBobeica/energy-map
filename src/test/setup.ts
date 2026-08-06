import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// jsdom has no WebGL; pretend it exists so the map shell mounts in tests.
// (MapLibre itself is mocked in component tests.)
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => ({}),
) as unknown as HTMLCanvasElement["getContext"]

// jsdom implements no media queries at all. Answering max-width against
// window.innerWidth covers the one query the app asks, and lets a test act
// like a phone by setting innerWidth before rendering.
window.matchMedia = ((query: string) => {
  const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(query)
  return {
    matches: maxWidth ? window.innerWidth <= Number(maxWidth[1]) : false,
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
