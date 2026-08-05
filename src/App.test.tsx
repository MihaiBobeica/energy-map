import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import App from "./App.tsx"

vi.mock("maplibre-gl", () => {
  class FakeMap {
    addControl = vi.fn()
    on = vi.fn()
    remove = vi.fn()
  }
  class FakeControl {}
  return {
    Map: FakeMap,
    NavigationControl: FakeControl,
    AttributionControl: FakeControl,
    default: {
      Map: FakeMap,
      NavigationControl: FakeControl,
      AttributionControl: FakeControl,
    },
  }
})

const emptyManifest = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-08-05T00:00:00Z",
  datasets: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("App shell", () => {
  it("renders the header, map container and attribution links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(emptyManifest), { status: 200 })),
    )
    render(<App />)

    expect(screen.getByRole("heading", { name: "Energy Map" })).toBeInTheDocument()
    expect(screen.getByTestId("map-container")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Data sources" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Methodology" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Licences" })).toBeInTheDocument()

    expect(await screen.findByText(/Application shell deployed/)).toBeInTheDocument()
  })

  it("shows an explicit failure state with retry when the manifest cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    )
    render(<App />)

    expect(await screen.findByText(/Data manifest failed to load/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
