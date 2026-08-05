import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// jsdom has no WebGL; pretend it exists so the map shell mounts in tests.
// (MapLibre itself is mocked in component tests.)
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => ({}),
) as unknown as HTMLCanvasElement["getContext"]

afterEach(() => {
  cleanup()
})
