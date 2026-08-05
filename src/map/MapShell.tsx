import {
  AttributionControl,
  Map as MaplibreMap,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

import "maplibre-gl/dist/maplibre-gl.css"

// Neutral self-hosted style: no external basemap, no tokens, no paid services.
const NEUTRAL_STYLE: StyleSpecification = {
  version: 8,
  name: "energy-map-neutral",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#dfe8ef" },
    },
  ],
}

function isWebGlSupported(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function MapShell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(() => !isWebGlSupported())

  useEffect(() => {
    const container = containerRef.current
    if (!container || failed) return

    let map: MaplibreMap | undefined
    try {
      map = new MaplibreMap({
        container,
        style: NEUTRAL_STYLE,
        center: [10, 25],
        zoom: 1.4,
        minZoom: 0.8,
        maxZoom: 12,
        attributionControl: false,
      })
      map.addControl(
        new NavigationControl({ showCompass: false, visualizePitch: false }),
        "top-right",
      )
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: "Energy Map — no data layers loaded yet",
        }),
        "bottom-right",
      )
      map.on("error", (event: { error: unknown }) => {
        console.error("MapLibre error", event.error)
      })
    } catch (error) {
      console.error("Map initialization failed", error)
      queueMicrotask(() => setFailed(true))
    }

    return () => {
      map?.remove()
    }
  }, [failed])

  if (failed) {
    return (
      <div className="map-fallback" role="note">
        The interactive map could not be initialized in this browser (WebGL is required). The data
        panels will remain available.
      </div>
    )
  }

  return <div ref={containerRef} className="map-container" data-testid="map-container" />
}
