import type { FeatureCollection } from "geojson"
import {
  AttributionControl,
  Map as MaplibreMap,
  NavigationControl,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

import { fillColorExpression, MISSING_COLOR, type ScaleDefinition } from "../utils/scale.ts"
import { configureMaplibreWorker } from "./maplibreWorker.ts"
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
      paint: { "background-color": "#a8c2d4" },
    },
  ],
}

const SOURCE_ID = "countries"

export type HoverInfo = { x: number; y: number; iso3: string; name: string }

type MapViewProps = {
  geojson: FeatureCollection | null
  valuesById: ReadonlyMap<number, number> | null
  selectedIso3: string | null
  scale: ScaleDefinition
  attribution: string
  onHover: (info: HoverInfo | null) => void
  onSelect: (iso3: string | null) => void
}

function isWebGlSupported(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function MapView({
  geojson,
  valuesById,
  selectedIso3,
  scale,
  attribution,
  onHover,
  onSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const [failed, setFailed] = useState(() => !isWebGlSupported())
  const [mapReady, setMapReady] = useState(false)
  const [layersReady, setLayersReady] = useState(false)
  const hoverRef = useRef(onHover)
  const selectRef = useRef(onSelect)
  // Read at layer-creation time only; later changes go through setPaintProperty
  // below so switching scale never rebuilds the map or its source.
  const scaleRef = useRef(scale)
  // Hover lives here rather than in React state: it changes on every
  // mousemove, and a filter swap is cheaper than a re-render.
  const hoveredRef = useRef("")
  useEffect(() => {
    hoverRef.current = onHover
    selectRef.current = onSelect
    scaleRef.current = scale
  }, [onHover, onSelect, scale])

  useEffect(() => {
    const container = containerRef.current
    if (!container || failed) return

    let map: MaplibreMap | undefined
    try {
      // Must run before the first Map is constructed: the worker pool reads the
      // configured URL lazily, when it spawns the first worker.
      configureMaplibreWorker()
      map = new MaplibreMap({
        container,
        style: NEUTRAL_STYLE,
        center: [10, 20],
        zoom: 1.3,
        minZoom: 0.8,
        maxZoom: 10,
        attributionControl: false,
      })
      // Bottom-right, not top-right: the country panel opens against the top
      // right edge and the zoom buttons ended up underneath it.
      map.addControl(
        new NavigationControl({ showCompass: false, visualizePitch: false }),
        "bottom-right",
      )
      map.on("error", (event: { error: unknown }) => {
        console.error("MapLibre error", event.error)
      })
      map.once("load", () => setMapReady(true))
      mapRef.current = map
    } catch (error) {
      console.error("Map initialization failed", error)
      queueMicrotask(() => setFailed(true))
    }

    return () => {
      mapRef.current = null
      setMapReady(false)
      setLayersReady(false)
      map?.remove()
    }
  }, [failed])

  // Add the country source and layers once map + geometry are both ready.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !geojson || map.getSource(SOURCE_ID)) return

    map.addSource(SOURCE_ID, { type: "geojson", data: geojson })
    map.addLayer({
      id: "countries-fill",
      type: "fill",
      source: SOURCE_ID,
      paint: {
        // Cast: expression built centrally so legend and map always agree.
        "fill-color": fillColorExpression(scaleRef.current) as never,
        "fill-opacity": 1,
      },
    })
    map.addLayer({
      id: "countries-outline",
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#7d94a8",
        // Hairlines at world zoom keep dense regions such as Europe readable
        // as colour rather than as a mesh of borders; they thicken as you
        // zoom in and the borders become the thing you are looking at.
        "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 3, 0.6, 6, 1] as never,
      },
    })
    // Hover feedback: the map previously answered a hover only with a
    // tooltip, so the pointer had nothing anchoring it to a shape.
    map.addLayer({
      id: "countries-hover",
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "iso3"], ""],
      paint: { "line-color": "#0f2740", "line-width": 1.25, "line-opacity": 0.55 },
    })
    map.addLayer({
      id: "countries-selected",
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "iso3"], ""],
      paint: { "line-color": "#0f2740", "line-width": 2 },
    })

    const setHovered = (iso3: string) => {
      if (hoveredRef.current === iso3) return
      hoveredRef.current = iso3
      map.setFilter("countries-hover", ["==", ["get", "iso3"], iso3])
    }

    map.on("mousemove", "countries-fill", (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return
      map.getCanvas().style.cursor = "pointer"
      const properties = feature.properties as { iso3?: string; name?: string }
      if (typeof properties.iso3 === "string" && typeof properties.name === "string") {
        setHovered(properties.iso3)
        hoverRef.current({
          x: event.point.x,
          y: event.point.y,
          iso3: properties.iso3,
          name: properties.name,
        })
      }
    })
    map.on("mouseleave", "countries-fill", () => {
      map.getCanvas().style.cursor = ""
      setHovered("")
      hoverRef.current(null)
    })
    map.on("click", (event: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["countries-fill"] })
      const properties = features[0]?.properties as { iso3?: string } | undefined
      selectRef.current(typeof properties?.iso3 === "string" ? properties.iso3 : null)
    })

    setLayersReady(true)
  }, [mapReady, geojson])

  // Paint values through feature state; countries without a value fall back
  // to the missing colour (never zero).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layersReady || !valuesById) return
    map.removeFeatureState({ source: SOURCE_ID })
    for (const [id, value] of valuesById) {
      map.setFeatureState({ source: SOURCE_ID, id }, { value })
    }
  }, [layersReady, valuesById])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layersReady) return
    map.setFilter("countries-selected", ["==", ["get", "iso3"], selectedIso3 ?? ""])
  }, [layersReady, selectedIso3])

  // Totals and per-capita values differ by orders of magnitude, so switching
  // between them repaints with the other scale's thresholds.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layersReady) return
    map.setPaintProperty("countries-fill", "fill-color", fillColorExpression(scale) as never)
  }, [layersReady, scale])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const control = new AttributionControl({ compact: false, customAttribution: attribution })
    map.addControl(control, "bottom-right")
    return () => {
      map.removeControl(control)
    }
  }, [mapReady, attribution])

  if (failed) {
    return (
      <div className="map-fallback" role="note" style={{ background: MISSING_COLOR }}>
        The interactive map could not be initialized in this browser (WebGL is required). The data
        panels remain available.
      </div>
    )
  }

  return <div ref={containerRef} className="map-container" data-testid="map-container" />
}
